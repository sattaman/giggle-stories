// Driving adapter: the /v1 HTTP API shared by web and (later) mobile clients.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Transcriber } from "@storytime/app";
import { ReplyBody, StartStoryBody, type NarrationClips, type StoryList, type TranscriptionResult } from "@storytime/domain";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { z } from "zod";
import { StoryConflictError, StoryNotFoundError, type StoryService } from "./story-service.ts";

class BadRequestError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid request");
  }
}

/** Validates client input: failures are 400s. (Other zod failures are upstream bugs → 502.) */
function parseRequest<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestError(result.error.issues);
  return result.data;
}

const StoryParams = z.object({ id: z.string().regex(/^story_[a-z0-9]+$/) });
const AudioParams = z.object({ story: z.string(), file: z.string() });
const TranscriptionQuery = z.object({ storyId: StoryParams.shape.id.optional() });

export interface HttpDeps {
  readonly stories: StoryService;
  readonly transcriber: Transcriber;
  readonly narration: () => NarrationClips;
  readonly audioPath: (storyId: string, file: string) => string | undefined;
  readonly logger: FastifyBaseLogger | false;
}

export async function buildHttp(deps: HttpDeps): Promise<FastifyInstance> {
  const app = deps.logger === false ? Fastify() : Fastify({ loggerInstance: deps.logger });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof StoryNotFoundError) return reply.code(404).send({ error: "Story not found" });
    if (error instanceof StoryConflictError) return reply.code(409).send({ error: error.message });
    if (error instanceof BadRequestError) return reply.code(400).send({ error: error.message, issues: error.issues });
    if (error instanceof z.ZodError) {
      app.log.error({ issues: error.issues }, "upstream response failed validation");
      return reply.code(502).send({ error: "A story service sent something unexpected" });
    }
    app.log.error({ error: error instanceof Error ? error.stack : String(error) }, "request failed");
    return reply.code(500).send({ error: "Something went wrong" });
  });

  app.get("/v1/health", () => ({ ok: true }));

  app.get("/v1/narration", () => deps.narration());

  // Raw audio is transcribed in memory and never stored (privacy).
  app.post("/v1/transcriptions", async (request, reply) => {
    const file = await request.file();
    if (file === undefined) return reply.code(400).send({ error: "Missing audio" });
    const bytes = await file.toBuffer();
    const mimeType = file.mimetype.split(";")[0] ?? file.mimetype;
    const { storyId } = parseRequest(TranscriptionQuery, request.query);
    const text = await deps.transcriber.transcribe({ bytes, mimeType, storyId });
    const result: TranscriptionResult = { text };
    return result;
  });

  app.post("/v1/stories", async (request, reply) => {
    const { idea, ageBand } = parseRequest(StartStoryBody, request.body);
    return reply.code(201).send(await deps.stories.start(idea, ageBand));
  });

  app.get("/v1/stories", async () => {
    const list: StoryList = { stories: await deps.stories.list() };
    return list;
  });

  app.get("/v1/stories/:id", async (request) => {
    const { id } = parseRequest(StoryParams, request.params);
    return deps.stories.view(id);
  });

  app.post("/v1/stories/:id/replies", async (request) => {
    const { id } = parseRequest(StoryParams, request.params);
    return deps.stories.reply(id, parseRequest(ReplyBody, request.body));
  });

  // Carries on a story that stopped part-way (view.canRetry); 409 otherwise.
  app.post("/v1/stories/:id/retry", async (request) => {
    const { id } = parseRequest(StoryParams, request.params);
    return deps.stories.retry(id);
  });

  app.get("/v1/audio/:story/:file", async (request, reply) => {
    const { story, file } = parseRequest(AudioParams, request.params);
    const path = deps.audioPath(story, file);
    if (path === undefined) return reply.code(404).send({ error: "Not found" });
    try {
      const info = await stat(path);
      return await reply
        .type("audio/wav")
        .header("content-length", info.size)
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(createReadStream(path));
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
  });

  return app;
}
