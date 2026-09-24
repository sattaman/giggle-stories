// The story-performance queue as a pure state machine. Segments play in order;
// if the next one's audio isn't ready yet we wait for it, then carry on.
// The audio player (use-playback.ts) only follows what this machine says.

import type { Performance, PerformedSegment } from "@storytime/domain";
import { SILENT_AUDIO_PREFIX } from "../api/story-api.ts";
import { displayText, readingTimeMs } from "./lines.ts";

export type PlaybackState =
  /** Before the first tap: browsers only allow sound after a user gesture. */
  | { readonly phase: "ready" }
  | { readonly phase: "playing"; readonly index: number; readonly run: number }
  /** The line at `index` has no audio yet. */
  | { readonly phase: "waiting"; readonly index: number; readonly run: number }
  | { readonly phase: "paused"; readonly index: number; readonly run: number }
  | { readonly phase: "finished"; readonly run: number };

export type PlaybackEvent =
  /** Start, or start again from the top. */
  | { readonly type: "start" }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  /** The audio for line `index` of play-through `run` finished. Stale events are ignored. */
  | { readonly type: "segmentEnded"; readonly index: number; readonly run: number }
  /** New audio arrived from the server. */
  | { readonly type: "segmentsChanged" };

export interface Track {
  /** Whether each line (in play order) has audio. */
  readonly ready: readonly boolean[];
  /** No more lines will be added. */
  readonly complete: boolean;
}

export const INITIAL_PLAYBACK: PlaybackState = { phase: "ready" };

export function orderedSegments(performance: Performance): PerformedSegment[] {
  return [...performance.segments].sort((a, b) => a.index - b.index);
}

export interface LineSource {
  readonly url: string;
  readonly durationMs: number | null;
}

/**
 * What to play for a line: its audio, or, once the performance is complete and
 * the server couldn't voice it, a silent pause long enough to read it, so the
 * story still makes sense. Null while the audio may yet arrive.
 */
export function sourceFor(segment: PerformedSegment, complete: boolean): LineSource | null {
  if (segment.audioUrl !== null) return { url: segment.audioUrl, durationMs: segment.durationMs };
  if (!complete) return null;
  return { url: `${SILENT_AUDIO_PREFIX}unvoiced`, durationMs: readingTimeMs(displayText(segment.text)) };
}

export function trackOf(segments: readonly PerformedSegment[], complete: boolean): Track {
  return { ready: segments.map((s) => sourceFor(s, complete) !== null), complete };
}

export function playbackReducer(state: PlaybackState, event: PlaybackEvent, track: Track): PlaybackState {
  switch (event.type) {
    case "start":
      return settle(0, "run" in state ? state.run + 1 : 1, track);
    case "pause":
      return state.phase === "playing" || state.phase === "waiting"
        ? { phase: "paused", index: state.index, run: state.run }
        : state;
    case "resume":
      return state.phase === "paused" ? settle(state.index, state.run, track) : state;
    case "segmentEnded": {
      if (state.phase !== "playing" && state.phase !== "paused") return state;
      if (state.index !== event.index || state.run !== event.run) return state;
      if (state.phase === "paused") return { phase: "paused", index: state.index + 1, run: state.run };
      return settle(state.index + 1, state.run, track);
    }
    case "segmentsChanged":
      return state.phase === "waiting" ? settle(state.index, state.run, track) : state;
  }
}

function settle(index: number, run: number, track: Track): PlaybackState {
  if (track.ready[index] === true) return { phase: "playing", index, run };
  if (index >= track.ready.length && track.complete) return { phase: "finished", run };
  // Complete but this line has no audio: the server couldn't voice it. Skip, don't stall.
  if (track.complete) return settle(index + 1, run, track);
  return { phase: "waiting", index, run };
}

/** The line to show in the speech bubble, if any. */
export function currentIndex(state: PlaybackState): number | null {
  return "index" in state ? state.index : null;
}
