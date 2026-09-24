// Driven ports: everything the story engine needs from the outside world.
// Adapters (OpenRouter, Gemini, filesystem…) implement these; tests use fakes.

import type { StoryStage } from "@storytime/domain";
import type { z } from "zod";

/** A language model that returns data matching a zod schema. */
export interface StructuredModel {
  generate<S extends z.ZodType>(request: {
    readonly task: string; // used for tracing/logging, e.g. "extract_brief"
    readonly schema: S;
    readonly system: string;
    readonly prompt: string;
    readonly creative: boolean; // true → higher temperature / creative model
  }): Promise<z.infer<S>>;
}

export class VoiceRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`Voice description rejected: ${reason}`);
    this.name = "VoiceRejectedError";
  }
}

export interface VoiceDesigner {
  /** Creates a persistent voice from a description. Throws VoiceRejectedError on safety blocks. */
  design(request: { readonly name: string; readonly gender: "female" | "male" | "neutral"; readonly description: string }): Promise<{ readonly voiceId: string }>;
  /** A ready-made voice to use when design fails. */
  fallback(gender: "female" | "male" | "neutral", index: number): string;
}

export interface SpeechSynthesizer {
  synthesize(request: { readonly text: string; readonly voiceId: string; readonly style: string }): Promise<{
    readonly wav: Uint8Array;
    readonly durationMs: number;
  }>;
}

export interface Transcriber {
  transcribe(audio: { readonly bytes: Uint8Array; readonly mimeType: string }): Promise<string>;
}

export interface AudioStore {
  /** Stores a WAV and returns the URL clients should fetch it from. */
  save(storyId: string, name: string, wav: Uint8Array): Promise<string>;
}

/** Lets long-running nodes report progress to whoever is watching the story. */
export interface ProgressSink {
  stage(storyId: string, stage: StoryStage, message: string): void;
  segmentPerformed(
    storyId: string,
    segment: { readonly index: number; readonly audioUrl: string; readonly durationMs: number },
  ): void;
}

/** Structured logger (pino-compatible call shape). */
export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface StoryDeps {
  readonly model: StructuredModel;
  readonly voices: VoiceDesigner;
  readonly speech: SpeechSynthesizer;
  readonly audio: AudioStore;
  readonly progress: ProgressSink;
  readonly log: Logger;
  readonly narratorVoiceId: string;
}
