// Connects the pure playback machine to a real SegmentPlayer.

import type { Performance, PerformedSegment } from "@storytime/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SegmentPlayer } from "../audio/segment-player.ts";
import {
  INITIAL_PLAYBACK,
  orderedSegments,
  playbackReducer,
  sourceFor,
  trackOf,
  type PlaybackEvent,
  type PlaybackState,
  type Track,
} from "./playback.ts";

export interface Playback {
  readonly state: PlaybackState;
  readonly segments: readonly PerformedSegment[];
  readonly start: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
}

export function usePlayback(performance: Performance): Playback {
  const segments = useMemo(() => orderedSegments(performance), [performance]);
  const [state, setState] = useState<PlaybackState>(INITIAL_PLAYBACK);

  // Latest segments for callbacks that outlive a render (the player's onEnded).
  const latest = useRef<{ segments: readonly PerformedSegment[]; track: Track }>({
    segments,
    track: trackOf(segments, performance.complete),
  });

  const dispatch = useCallback((event: PlaybackEvent) => {
    setState((current) => playbackReducer(current, event, latest.current.track));
  }, []);

  // Each poll brings a new performance; if we were waiting for a line, maybe it's ready now.
  useEffect(() => {
    latest.current = { segments, track: trackOf(segments, performance.complete) };
    dispatch({ type: "segmentsChanged" });
  }, [segments, performance.complete, dispatch]);

  const player = useRef<SegmentPlayer | null>(null);
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    const created = new SegmentPlayer();
    player.current = created;
    return () => {
      created.dispose();
      player.current = null;
      loadedKey.current = null;
    };
  }, []);

  useEffect(() => {
    const segmentPlayer = player.current;
    if (segmentPlayer === null) return;
    switch (state.phase) {
      case "playing": {
        const key = `${String(state.run)}:${String(state.index)}`;
        if (loadedKey.current === key) {
          segmentPlayer.resume();
          return;
        }
        const segment = latest.current.segments[state.index];
        const source = segment === undefined ? null : sourceFor(segment, latest.current.track.complete);
        if (source === null) return;
        loadedKey.current = key;
        const { index, run } = state;
        segmentPlayer.play(source.url, source.durationMs, () => {
          dispatch({ type: "segmentEnded", index, run });
        });
        return;
      }
      case "paused":
        segmentPlayer.pause();
        return;
      case "ready":
      case "waiting":
      case "finished":
        return;
    }
  }, [state, dispatch]);

  return {
    state,
    segments,
    start: () => {
      dispatch({ type: "start" });
    },
    pause: () => {
      dispatch({ type: "pause" });
    },
    resume: () => {
      dispatch({ type: "resume" });
    },
  };
}
