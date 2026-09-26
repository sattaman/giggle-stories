import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoryView } from "@storytime/domain";
import { describe, expect, it } from "vitest";
import { buildHttp } from "../src/http.ts";
import { StoryConflictError, StoryNotFoundError, type StoryService } from "../src/story-service.ts";
import { buildView, idleProgress, type PersistedStory } from "../src/view.ts";

const script = {
  page: 1,
  segments: [
    { speaker: "narrator", text: "Once.", style: "warm" },
    { speaker: "pip", text: "Hi!", style: "excited" },
  ],
};

const empty: PersistedStory = { idea: "a rocket", cast: [], performance: [], illustrationUrl: null };

describe("buildView", () => {
  it("is 'working' with a friendly message while busy", () => {
    const view = buildView({ run: undefined, resumable: false,
      id: "story_1",
      state: empty,
      pending: undefined,
      progress: { ...idleProgress, busy: true, stage: "casting", message: "Giving everyone a voice…" },
    });
    expect(view).toMatchObject({ status: "working", stage: "casting", message: "Giving everyone a voice…" });
  });

  it("is 'waiting' with the question when the graph is interrupted", () => {
    const pending = { kind: "clarification", question: "Friendly or grumpy?", questionAudioUrl: null, round: 1 };
    const view = buildView({ run: undefined, resumable: false, id: "story_1", state: empty, pending, progress: idleProgress });
    expect(view).toMatchObject({ status: "waiting", pending });
  });

  it("streams performed segments while performing, then is 'done'", () => {
    const performed = new Map([[0, { audioUrl: "http://a/0.wav", durationMs: 900 }]]);
    const performing = buildView({ run: undefined, resumable: false,
      id: "story_1",
      state: { ...empty, script },
      pending: undefined,
      progress: { ...idleProgress, busy: true, stage: "performing", message: "…", performed },
    });
    expect(performing.status).toBe("performing");
    expect(performing.performance?.segments.map((s) => s.audioUrl)).toEqual(["http://a/0.wav", null]);

    const performance = script.segments.map((s, index) => ({ ...s, index, audioUrl: `http://a/${String(index)}.wav`, durationMs: 1 }));
    const done = buildView({ run: undefined, resumable: false, id: "story_1", state: { ...empty, script, performance }, pending: undefined, progress: idleProgress });
    expect(done.status).toBe("done");
    expect(done.performance?.complete).toBe(true);
  });

  it("upgrades characters saved before hello/voiceArchetype existed", async () => {
    const { PersistedStory } = await import("../src/view.ts");
    const old = {
      id: "orla", name: "Orla", role: "hero", emoji: "🧭", colour: "#ff8800", personality: "p", comicTrait: "t",
      gender: "female", voiceDescription: "A bright female cartoon heroine's voice with a British accent.",
    };
    const parsed = PersistedStory.parse({ cast: [old] });
    expect(parsed.cast[0]).toMatchObject({ name: "Orla", hello: "Hello! I'm Orla.", voiceArchetype: "kid-hero-female" });
  });

  it("offers to carry on a run that stopped with work still due", () => {
    const view = buildView({ run: undefined, resumable: true, id: "story_1", state: empty, pending: undefined, progress: idleProgress });
    expect(view).toMatchObject({ status: "error", canRetry: true, error: "This story got interrupted. Let's carry on!" });
  });

  it("shows a failed run as retryable while its checkpoint has work due", () => {
    const run = { state: "failed" as const, error: "provider down", resumes: 0 };
    const failed = buildView({ run, resumable: true, id: "story_1", state: empty, pending: undefined, progress: idleProgress });
    expect(failed).toMatchObject({ status: "error", canRetry: true });
    const lost = buildView({ run, resumable: false, id: "story_1", state: empty, pending: undefined, progress: idleProgress });
    expect(lost).toMatchObject({ status: "error", canRetry: false, error: "This story got lost. Let's make a new one!" });
  });
});

describe("http", () => {
  const view: StoryView = {
    id: "story_abc",
    status: "working",
    stage: "understanding",
    message: "Thinking…",
    idea: "a rocket",
    pending: null,
    characters: [],
    title: null,
    performance: null,
    illustrationUrl: null,
    error: null,
    canRetry: false,
  };
  const stories: StoryService = {
    start: () => Promise.resolve(view),
    view: (id) => (id === "story_abc" ? Promise.resolve(view) : Promise.reject(new StoryNotFoundError(id))),
    reply: () => Promise.reject(new StoryConflictError("Story isn't waiting for a reply")),
    retry: () => Promise.reject(new StoryConflictError("Story can't be carried on")),
    list: () => Promise.resolve([]),
  };
  const app = () =>
    buildHttp({
      stories,
      transcriber: { transcribe: () => Promise.resolve("hello") },
      narration: () => ({ clips: { welcome: "http://a/w.wav", idea: null, thinking: null, voices_intro: null, voices_outro: null, changing: null, ready: null, the_end: null } }),
      audioPath: () => undefined,
      imageFile: () => undefined,
      logger: false,
    });

  it("starts a story", async () => {
    const res = await (await app()).inject({ method: "POST", url: "/v1/stories", payload: { idea: "a rocket" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "story_abc" });
  });

  it("serves narration clips", async () => {
    const res = await (await app()).inject({ method: "GET", url: "/v1/narration" });
    expect(res.json()).toMatchObject({ clips: { welcome: "http://a/w.wav", idea: null } });
  });

  it("validates bodies and ids", async () => {
    const server = await app();
    expect((await server.inject({ method: "POST", url: "/v1/stories", payload: { idea: "" } })).statusCode).toBe(400);
    expect((await server.inject({ method: "GET", url: "/v1/stories/story_missing" })).statusCode).toBe(404);
    expect((await server.inject({ method: "GET", url: "/v1/stories/../../etc" })).statusCode).toBe(404);
  });

  it("files a spoken answer under its story, and rejects a malformed story id", async () => {
    const seen: (string | undefined)[] = [];
    const server = await buildHttp({
      stories,
      transcriber: {
        transcribe: ({ storyId }) => {
          seen.push(storyId);
          return Promise.resolve("moon cheese");
        },
      },
      narration: () => ({ clips: { welcome: null, idea: null, thinking: null, voices_intro: null, voices_outro: null, changing: null, ready: null, the_end: null } }),
      audioPath: () => undefined,
      imageFile: () => undefined,
      logger: false,
    });
    const boundary = "----storytime";
    const upload = {
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="a.webm"\r\nContent-Type: audio/webm\r\n\r\nxx\r\n--${boundary}--\r\n`,
    };
    expect((await server.inject({ method: "POST", url: "/v1/transcriptions?storyId=story_abc", ...upload })).json()).toEqual({ text: "moon cheese" });
    expect((await server.inject({ method: "POST", url: "/v1/transcriptions", ...upload })).statusCode).toBe(200);
    expect((await server.inject({ method: "POST", url: "/v1/transcriptions?storyId=../x", ...upload })).statusCode).toBe(400);
    expect(seen).toEqual(["story_abc", undefined]);
  });

  it("serves a story's picture with its type, and refuses unsafe names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "storytime-img-"));
    await writeFile(join(dir, "page-1-picture.png"), new Uint8Array([137, 80, 78, 71]));
    const server = await buildHttp({
      stories,
      transcriber: { transcribe: () => Promise.resolve("") },
      narration: () => ({ clips: { welcome: null, idea: null, thinking: null, voices_intro: null, voices_outro: null, changing: null, ready: null, the_end: null } }),
      audioPath: () => undefined,
      imageFile: (_story, file) => (file === "page-1-picture.png" ? { path: join(dir, file), type: "image/png" } : undefined),
      logger: false,
    });
    const ok = await server.inject({ method: "GET", url: "/v1/images/story_abc/page-1-picture.png" });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/png");
    expect((await server.inject({ method: "GET", url: "/v1/images/story_abc/nope.svg" })).statusCode).toBe(404);
  });

  it("reports upstream validation failures as 502, not 400", async () => {
    const { z } = await import("zod");
    const server = await buildHttp({
      stories: { ...stories, start: () => Promise.reject(z.string().safeParse(1).error ?? new Error("x")) },
      transcriber: { transcribe: () => Promise.resolve("") },
      narration: () => ({ clips: { welcome: null, idea: null, thinking: null, voices_intro: null, voices_outro: null, changing: null, ready: null, the_end: null } }),
      audioPath: () => undefined,
      imageFile: () => undefined,
      logger: false,
    });
    const res = await server.inject({ method: "POST", url: "/v1/stories", payload: { idea: "a rocket" } });
    expect(res.statusCode).toBe(502);
  });

  it("returns 409 when replying out of turn", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: "/v1/stories/story_abc/replies",
      payload: { kind: "answer", text: "grumpy" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 when retrying a story that can't be carried on", async () => {
    const res = await (await app()).inject({ method: "POST", url: "/v1/stories/story_abc/retry" });
    expect(res.statusCode).toBe(409);
  });
});
