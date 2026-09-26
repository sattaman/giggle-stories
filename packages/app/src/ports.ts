// Driven ports: everything the story engine needs from the outside world.
// Adapters (OpenRouter, Gemini, filesystem…) implement these; tests use fakes.

import type { VoiceArchetype } from "@storytime/domain";
import type { z } from "zod";

/** A language model that returns data matching a zod schema. */
export interface StructuredModel {
  generate<S extends z.ZodType>(request: {
    readonly task: string; // used for tracing/logging, e.g. "extract_brief"
    readonly schema: S;
    readonly system: string;
    readonly prompt: string;
    readonly creative: boolean; // true → higher temperature / creative model
    /** Aborted when the graph node times out or the run is cancelled. */
    readonly signal?: AbortSignal | undefined;
  }): Promise<z.infer<S>>;
}

export class VoiceRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`Voice description rejected: ${reason}`);
    this.name = "VoiceRejectedError";
  }
}

export interface VoiceDesigner {
  /**
   * Creates a persistent voice from a description. Throws VoiceRejectedError on safety blocks.
   * `preview` is a short WAV of the new voice, when the provider supplies one.
   */
  design(request: {
    readonly name: string;
    readonly gender: "female" | "male" | "neutral";
    readonly description: string;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{
    readonly voiceId: string;
    readonly preview: Uint8Array | undefined;
  }>;
  /** A ready-made voice to use when design fails. */
  fallback(gender: "female" | "male" | "neutral", index: number): string;
}

export interface SpeechSynthesizer {
  /**
   * `fallbackVoice` is a built-in voice (right gender) used when the designed `voiceId` can't be,
   * e.g. once the voice-design-capable models are out of daily quota.
   */
  synthesize(request: {
    readonly text: string;
    readonly voiceId: string;
    readonly fallbackVoice: string;
    readonly style: string;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{
    readonly wav: Uint8Array;
    readonly durationMs: number;
    /** The model that actually spoke, when the provider falls back between models. */
    readonly model?: string;
  }>;
}

export interface Transcriber {
  /** `storyId`, when the recording answers a story's question, lets tracing file it under that story. */
  transcribe(audio: { readonly bytes: Uint8Array; readonly mimeType: string; readonly storyId?: string | undefined }): Promise<string>;
}

export interface AudioStore {
  /** Stores a WAV and returns the URL clients should fetch it from. */
  save(storyId: string, name: string, wav: Uint8Array): Promise<string>;
}

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

/** A picture handed to the illustrator to copy characters from (e.g. the story's first page). */
export interface ReferencePicture {
  readonly image: Uint8Array;
  readonly type: ImageType;
}

/** Draws a picture from a text description, optionally matching reference pictures. */
export interface Illustrator {
  draw(request: {
    readonly prompt: string;
    readonly references?: readonly ReferencePicture[] | undefined;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{
    readonly image: Uint8Array;
    readonly type: ImageType;
  }>;
}

/** Writes an animated SVG scene (a text model drawing with shapes and CSS animation). */
export interface SceneDrawer {
  draw(request: { readonly prompt: string; readonly signal?: AbortSignal | undefined }): Promise<{ readonly svg: string }>;
}

export interface ImageStore {
  /** Stores an image and returns the URL clients should fetch it from. */
  save(storyId: string, name: string, image: Uint8Array, type: ImageType): Promise<string>;
  /** Stores a checked, animated SVG scene and returns its URL. */
  saveScene(storyId: string, name: string, svg: string): Promise<string>;
}

/** The kinds of picture a page can have: a painted illustration, an animated SVG scene. */
export type PictureKind = "painted" | "animated";

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
  readonly illustrator: Illustrator;
  readonly sceneDrawer: SceneDrawer;
  readonly images: ImageStore;
  /** Which pictures to make for each page (both, for comparing them). */
  readonly pictures: readonly PictureKind[];
  readonly log: Logger;
  readonly narratorVoiceId: string;
  /** Pre-approved designed cartoon voices, used when a character's own design is rejected. */
  readonly stockVoices: Readonly<Partial<Record<"female" | "male" | "neutral", string>>>;
  /** Ready-made character voices by archetype (designed once). Empty → design per character. */
  readonly voiceLibrary: Readonly<Partial<Record<VoiceArchetype, string>>>;
}
