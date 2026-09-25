// A playlist of one-off clips (narrator lines, character hellos) as a pure state
// machine, like playback.ts. Starting a new playlist replaces the old one, so two
// clips can never overlap. The narrator provider (narration.tsx) plays whatever
// this machine says is current.

import type { Character, NarrationClips, NarrationKey } from "@storytime/domain";
import { silentDurationMs } from "../api/story-api.ts";

export interface SequenceClip {
  /** Who or what is speaking, e.g. "narration:welcome" or "hello:mrs-pickle". */
  readonly key: string;
  /** Null: this clip isn't available, so the sequence skips it. */
  readonly url: string | null;
  /** Known length; null means "until the audio says it ended" (with a fallback timer). */
  readonly durationMs: number | null;
}

export type SequenceState =
  | { readonly phase: "idle"; readonly run: number }
  | { readonly phase: "playing"; readonly clips: readonly SequenceClip[]; readonly index: number; readonly run: number }
  /** Interrupted: by the child, a new screen, the mic or the story starting. */
  | { readonly phase: "stopped"; readonly clips: readonly SequenceClip[]; readonly run: number }
  | { readonly phase: "finished"; readonly clips: readonly SequenceClip[]; readonly run: number };

export type SequenceEvent =
  /** Play this playlist from the top, replacing whatever was playing. */
  | { readonly type: "start"; readonly clips: readonly SequenceClip[] }
  | { readonly type: "stop" }
  /** Clip `index` of play-through `run` finished. Stale events are ignored. */
  | { readonly type: "clipEnded"; readonly index: number; readonly run: number }
  /** Move on to the next clip now. */
  | { readonly type: "skip" };

export const INITIAL_SEQUENCE: SequenceState = { phase: "idle", run: 0 };

export function sequenceReducer(state: SequenceState, event: SequenceEvent): SequenceState {
  switch (event.type) {
    case "start":
      return settle(event.clips, 0, state.run + 1);
    case "stop":
      return state.phase === "playing" ? { phase: "stopped", clips: state.clips, run: state.run } : state;
    case "clipEnded":
      if (state.phase !== "playing" || state.index !== event.index || state.run !== event.run) return state;
      return settle(state.clips, state.index + 1, state.run);
    case "skip":
      return state.phase === "playing" ? settle(state.clips, state.index + 1, state.run) : state;
  }
}

function settle(clips: readonly SequenceClip[], from: number, run: number): SequenceState {
  const index = clips.findIndex((clip, i) => i >= from && clip.url !== null);
  return index === -1 ? { phase: "finished", clips, run } : { phase: "playing", clips, index, run };
}

/** The clip playing right now, if any. */
export function currentClip(state: SequenceState): SequenceClip | null {
  return state.phase === "playing" ? (state.clips[state.index] ?? null) : null;
}

// ── Clips for this app ───────────────────────────────────────────────────────

export function narrationClipKey(key: NarrationKey): string {
  return `narration:${key}`;
}

export function helloClipKey(characterId: string): string {
  return `hello:${characterId}`;
}

/** The character whose hello `key` is, if it is one. */
export function helloSpeaker(key: string): string | null {
  return key.startsWith("hello:") ? key.slice("hello:".length) : null;
}

function clipOf(key: string, url: string | null): SequenceClip {
  return { key, url, durationMs: url === null ? null : silentDurationMs(url) };
}

export function narrationClip(narration: NarrationClips | null, key: NarrationKey): SequenceClip {
  return clipOf(narrationClipKey(key), narration?.clips[key] ?? null);
}

export function helloClip(character: Character): SequenceClip {
  return clipOf(helloClipKey(character.id), character.voice?.sampleUrl ?? null);
}

/**
 * The outline's voice introductions: the narrator's intro, each character's
 * hello in order, then the narrator's outro. Without narration (muted or not
 * available) it's just the hellos.
 */
export function voiceIntroClips(characters: readonly Character[], narration: NarrationClips | null): SequenceClip[] {
  return [narrationClip(narration, "voices_intro"), ...characters.map(helloClip), narrationClip(narration, "voices_outro")];
}

/** Whether the clip belongs to the voice introductions (so leaving the outline hushes it). */
export function isVoiceIntroClip(key: string): boolean {
  return key === narrationClipKey("voices_intro") || key === narrationClipKey("voices_outro") || helloSpeaker(key) !== null;
}
