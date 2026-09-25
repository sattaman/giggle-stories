// Driven port: everything the child UI needs from the Storytime server.
// Implemented over HTTP (http-story-api.ts) and in memory (mock-story-api.ts).

import type { AgeBand, NarrationClips, ReplyBody, StorySummary, StoryView } from "@storytime/domain";

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
  /** Carries on a story that stopped part-way (`view.canRetry`). */
  retry(id: string): Promise<StoryView>;
  /** The narrator's fixed guide lines. Callers treat a failure as "no narration". */
  narration(): Promise<NarrationClips>;
  /** Every story made so far, most recent first. */
  listStories(): Promise<StorySummary[]>;
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

/** A silent placeholder that carries its own length, for clips whose API has no duration field. */
export function silentUrl(label: string, durationMs: number): string {
  return `${SILENT_AUDIO_PREFIX}${label}?ms=${String(Math.round(durationMs))}`;
}

/** The length baked into a `silentUrl`, or null for real audio and plain silent placeholders. */
export function silentDurationMs(url: string): number | null {
  if (!url.startsWith(SILENT_AUDIO_PREFIX)) return null;
  const match = /\?ms=(\d+)$/.exec(url);
  return match?.[1] === undefined ? null : Number(match[1]);
}
