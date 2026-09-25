// The narrator: one voice channel for the app. Narrator lines and character
// hellos all go through a single clip-sequence machine and SegmentPlayer, so a
// new clip always stops the one before it.
//
// The clips are fetched once at app start; if that fails (or the server has no
// /v1/narration yet) there's simply no narration.

import type { NarrationClips, NarrationKey } from "@storytime/domain";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStoryApi } from "../api/api-context.tsx";
import { mayAutoplay } from "../audio/autoplay.ts";
import { SegmentPlayer } from "../audio/segment-player.ts";
import {
  currentClip,
  INITIAL_SEQUENCE,
  narrationClip,
  narrationClipKey,
  sequenceReducer,
  type SequenceClip,
  type SequenceEvent,
  type SequenceState,
} from "./clip-sequence.ts";

const MUTED_STORAGE_KEY = "storytime.narratorMuted";

export interface Narration {
  /** Null until loaded, and for good if the server has no narration. */
  readonly clips: NarrationClips | null;
  readonly loaded: boolean;
  /** The parent's "narrator off" switch (remembered for the session). */
  readonly muted: boolean;
  readonly setMuted: (muted: boolean) => void;
  readonly state: SequenceState;
  /** Whether the narrator has this line (and isn't muted). */
  readonly has: (key: NarrationKey) => boolean;
  /** Plays one narrator line now (e.g. from a tap), replacing anything playing. */
  readonly say: (key: NarrationKey) => void;
  /** Plays a playlist from the top, replacing anything playing. */
  readonly play: (clips: readonly SequenceClip[]) => void;
  readonly stop: () => void;
  /** Stops only if the clip playing right now matches, e.g. when its screen goes away. */
  readonly stopWhere: (matches: (key: string) => boolean) => void;
}

const NarrationContext = createContext<Narration | null>(null);

export function NarrationProvider({ children }: { readonly children: ReactNode }) {
  const api = useStoryApi();
  const [clips, setClips] = useState<NarrationClips | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMutedState] = useState(readMuted);
  const [state, setState] = useState<SequenceState>(INITIAL_SEQUENCE);

  useEffect(() => {
    let cancelled = false;
    api
      .narration()
      .then((result) => {
        if (!cancelled) setClips(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const player = useRef<SegmentPlayer | null>(null);
  const loadedKey = useRef<string | null>(null);
  // The current state for callbacks that run outside render (stopWhere).
  const latest = useRef<SequenceState>(state);

  const dispatch = useCallback((event: SequenceEvent) => {
    setState((current) => sequenceReducer(current, event));
  }, []);

  useEffect(() => {
    const created = new SegmentPlayer();
    player.current = created;
    return () => {
      created.dispose();
      player.current = null;
      loadedKey.current = null;
    };
  }, []);

  // The player follows the machine.
  useEffect(() => {
    latest.current = state;
    const segmentPlayer = player.current;
    if (segmentPlayer === null) return;
    const clip = currentClip(state);
    if (state.phase !== "playing" || clip?.url == null) {
      loadedKey.current = null;
      segmentPlayer.stop();
      return;
    }
    const key = `${String(state.run)}:${String(state.index)}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    const { index, run } = state;
    segmentPlayer.play(clip.url, clip.durationMs, () => {
      dispatch({ type: "clipEnded", index, run });
    });
  }, [state, dispatch]);

  const stop = useCallback(() => {
    // Hush straight away (e.g. before the mic opens), then tell the machine.
    player.current?.stop();
    loadedKey.current = null;
    dispatch({ type: "stop" });
  }, [dispatch]);

  const stopWhere = useCallback(
    (matches: (key: string) => boolean) => {
      const clip = currentClip(latest.current);
      if (clip !== null && matches(clip.key)) stop();
    },
    [stop],
  );

  const play = useCallback(
    (playlist: readonly SequenceClip[]) => {
      dispatch({ type: "start", clips: playlist });
    },
    [dispatch],
  );

  const has = useCallback((key: NarrationKey) => !muted && narrationClip(clips, key).url !== null, [clips, muted]);

  const say = useCallback(
    (key: NarrationKey) => {
      if (has(key)) play([narrationClip(clips, key)]);
    },
    [clips, has, play],
  );

  const setMuted = useCallback(
    (next: boolean) => {
      setMutedState(next);
      writeMuted(next);
      if (next) stopWhere((key) => key.startsWith("narration:"));
    },
    [stopWhere],
  );

  const value = useMemo<Narration>(
    () => ({ clips: muted ? null : clips, loaded, muted, setMuted, state, has, say, play, stop, stopWhere }),
    [clips, loaded, muted, setMuted, state, has, say, play, stop, stopWhere],
  );
  return <NarrationContext value={value}>{children}</NarrationContext>;
}

export function useNarration(): Narration {
  const narration = useContext(NarrationContext);
  if (narration === null) throw new Error("useNarration must be used inside <NarrationProvider>");
  return narration;
}

/**
 * Says a screen's line once per visit: when the screen is shown (and the clips
 * have loaded), if the browser allows sound without a tap. Stops it when the
 * screen goes away. `visible` is false while the screen is covered, e.g. by
 * another route pushed on top.
 */
export function useNarrationLine(key: NarrationKey | null, visible: boolean): void {
  const { loaded, say, stopWhere } = useNarration();
  useEffect(() => {
    if (key === null || !visible || !loaded) return undefined;
    if (mayAutoplay()) say(key);
    const clipKey = narrationClipKey(key);
    return () => {
      stopWhere((current) => current === clipKey);
    };
    // Once per visit: not again when `say` changes (e.g. the mute switch).
  }, [key, visible, loaded, stopWhere]);
}

function readMuted(): boolean {
  try {
    return globalThis.sessionStorage.getItem(MUTED_STORAGE_KEY) === "1";
  } catch {
    // No sessionStorage (native, or blocked): the switch lasts until the app closes.
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    globalThis.sessionStorage.setItem(MUTED_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // See readMuted.
  }
}
