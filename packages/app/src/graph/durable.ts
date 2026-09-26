// Paid provider calls as LangGraph tasks.
//
// A task's result is checkpointed as soon as it completes. If its node runs again (the child
// taps "Try again", or the server restarts mid-node), LangGraph restores finished results
// instead of calling the provider again, so only unfinished work is paid for twice.
//
// Rules (docs: oss/langgraph/functional-api "Determinism", "Idempotency"):
// - Results must be JSON. Audio is saved inside the task and only its URL is returned.
// - Tasks are matched by call order within a node, so a node must make the same calls in the
//   same order when it re-runs. Arguments aren't persisted, so ports can be passed in.
// - A task that started but didn't finish runs again; saves use stable names, so re-running
//   one overwrites the same file.
// - A task that throws fails the whole run, even if the node catches the error, and aborts
//   its sibling tasks. So calls whose failure the story tolerates (speech, voice design)
//   return an outcome instead; that outcome is checkpointed, so a replay takes the same
//   fallback. Model calls do throw: the node fails, nothing is saved for that call, and
//   "Try again" asks the model again.

import { task } from "@langchain/langgraph";
import type { z } from "zod";
import type { Limiter } from "../concurrency.ts";
import { VoiceRejectedError, type AudioStore, type SpeechSynthesizer, type StructuredModel, type VoiceDesigner } from "../ports.ts";

type GenerateRequest = Parameters<StructuredModel["generate"]>[0];

const unlimited: Limiter = (fn) => fn();

const generate = task("generate", (model: StructuredModel, request: GenerateRequest): Promise<unknown> => model.generate(request));

/** The same model, with every call run as a durable task (results re-validated on restore). */
export function durableModel(model: StructuredModel): StructuredModel {
  return {
    generate: async <S extends z.ZodType>(request: Parameters<StructuredModel["generate"]>[0] & { readonly schema: S }) =>
      request.schema.parse(await generate(model, request)),
  };
}

export interface Clip {
  readonly storyId: string;
  /** Stable file name, e.g. `page-1-03`, so a re-run overwrites rather than duplicates. */
  readonly name: string;
  readonly text: string;
  readonly voiceId: string;
  readonly fallbackVoice: string;
  readonly style: string;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Like `durableModel`, for calls the story can do without (e.g. rewriting a rejected voice
 * description, where a stock voice is the fallback). The task records a failure as an outcome;
 * the error is re-thrown here, in node code, where the caller's catch works.
 */
export function tolerantDurableModel(model: StructuredModel): StructuredModel {
  return {
    generate: async <S extends z.ZodType>(request: Parameters<StructuredModel["generate"]>[0] & { readonly schema: S }) => {
      const outcome = await generateOrFail(model, request);
      if (!outcome.ok) throw new Error(outcome.error);
      return request.schema.parse(outcome.value);
    },
  };
}

/** A tolerated failure, described for logs (tasks return JSON, not Error objects). */
export interface Failed {
  readonly ok: false;
  readonly error: string;
}

function failed(error: unknown): Failed {
  return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
}

const generateOrFail = task("generateOrFail", async (model: StructuredModel, request: GenerateRequest) => {
  try {
    return { ok: true as const, value: await model.generate(request) };
  } catch (error: unknown) {
    return failed(error);
  }
});

/**
 * Synthesises a line and saves it. Call it in a fixed order and pass `limit` to bound
 * concurrency: the limiter runs inside the task, so restored calls skip it.
 */
export const speak = task(
  "speak",
  async (ports: { readonly speech: SpeechSynthesizer; readonly audio: AudioStore; readonly limit?: Limiter }, clip: Clip) => {
    const run = ports.limit ?? unlimited;
    try {
      const { wav, durationMs } = await run(() =>
        ports.speech.synthesize({
          text: clip.text,
          voiceId: clip.voiceId,
          fallbackVoice: clip.fallbackVoice,
          style: clip.style,
          signal: clip.signal,
        }),
      );
      return { ok: true as const, audioUrl: await ports.audio.save(clip.storyId, clip.name, wav), durationMs };
    } catch (error: unknown) {
      return failed(error);
    }
  },
);

export interface VoiceRequest {
  readonly storyId: string;
  readonly name: string;
  readonly gender: "female" | "male" | "neutral";
  readonly description: string;
  /** Where the provider's preview clip is saved, if it sends one. */
  readonly previewName: string;
  readonly signal?: AbortSignal | undefined;
}

/** Designs a voice and saves its preview. `rejected` means the description was blocked for safety. */
export const designVoice = task(
  "designVoice",
  async (ports: { readonly voices: VoiceDesigner; readonly audio: AudioStore }, request: VoiceRequest) => {
    try {
      const { voiceId, preview } = await ports.voices.design({
        name: request.name,
        gender: request.gender,
        description: request.description,
        signal: request.signal,
      });
      const previewUrl = preview === undefined ? null : await ports.audio.save(request.storyId, request.previewName, preview);
      return { ok: true as const, voiceId, previewUrl };
    } catch (error: unknown) {
      return { ...failed(error), rejected: error instanceof VoiceRejectedError };
    }
  },
);
