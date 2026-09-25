// Driven port: everything the child UI needs from the Storytime server.
// Implemented over HTTP (http-story-api.ts) and in memory (mock-story-api.ts).

import type { AgeBand, ReplyBody, StoryView } from "@storytime/domain";

/** A finished recording, in the shape each platform's FormData understands. */
export type AudioUpload =
  | { readonly kind: "blob"; readonly blob: Blob; readonly filename: string }
  | { readonly kind: "file"; readonly uri: string; readonly name: string; readonly type: string };

export interface StoryApi {
  /** Speech to text. Resolves to the transcript (possibly empty). */
  transcribe(audio: AudioUpload): Promise<string>;
  start(idea: string, ageBand: AgeBand): Promise<StoryView>;
  get(id: string): Promise<StoryView>;
  reply(id: string, body: ReplyBody): Promise<StoryView>;
}

export class ApiError extends Error {
  override readonly name = "ApiError";
  /** HTTP status, or null when the request never got a response (offline, timeout). */
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

/**
 * Audio URLs with this prefix are silent placeholders (used by the mock): the
 * player "plays" them for the segment's duration without making a sound.
 */
export const SILENT_AUDIO_PREFIX = "silent:";
