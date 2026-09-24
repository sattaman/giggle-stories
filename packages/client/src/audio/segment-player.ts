// Plays one story line at a time and reports, exactly once, when it has ended.
//
// "Ended" comes from expo-audio's didJustFinish, but on web that is derived from
// the pause-before-ended event, so a fallback timer (line duration + 500ms,
// paused along with the audio) guarantees the story never gets stuck.

import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import { SILENT_AUDIO_PREFIX } from "../api/story-api.ts";

const FALLBACK_SLACK_MS = 500;
/** Used when the server doesn't know a line's duration. */
const UNKNOWN_DURATION_MS = 15_000;
/** A "finished" status this soon after starting a line belongs to the previous one. */
const STALE_FINISH_MS = 300;

interface Current {
  readonly onEnded: () => void;
  readonly startedAt: number;
  /** Time left on the fallback timer while it isn't running. */
  remainingMs: number;
  runningSince: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  silent: boolean;
}

export class SegmentPlayer {
  private player: AudioPlayer | null = null;
  private current: Current | null = null;

  play(url: string, durationMs: number | null, onEnded: () => void): void {
    this.stop();
    const silent = url.startsWith(SILENT_AUDIO_PREFIX);
    this.current = {
      onEnded,
      startedAt: Date.now(),
      remainingMs: (durationMs ?? UNKNOWN_DURATION_MS) + FALLBACK_SLACK_MS,
      runningSince: null,
      timer: null,
      silent,
    };
    if (!silent) {
      const player = this.ensurePlayer();
      player.replace({ uri: url });
      player.play();
    }
    this.startFallback();
  }

  pause(): void {
    if (this.current === null) return;
    if (!this.current.silent) this.player?.pause();
    this.stopFallback();
  }

  resume(): void {
    if (this.current === null) return;
    if (!this.current.silent) this.player?.play();
    this.startFallback();
  }

  /** Stops the current line without reporting that it ended. */
  stop(): void {
    this.stopFallback();
    this.current = null;
    this.player?.pause();
  }

  dispose(): void {
    this.stop();
    this.player?.remove();
    this.player = null;
  }

  private ensurePlayer(): AudioPlayer {
    if (this.player !== null) return this.player;
    const player = createAudioPlayer(null, { updateInterval: 250 });
    player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
      const current = this.current;
      if (status.didJustFinish && current !== null && Date.now() - current.startedAt > STALE_FINISH_MS) this.finish();
    });
    this.player = player;
    return player;
  }

  private finish(): void {
    const current = this.current;
    if (current === null) return;
    this.stopFallback();
    this.current = null;
    current.onEnded();
  }

  private startFallback(): void {
    const current = this.current;
    // Nothing to time, or already running.
    if (current === null) return;
    if (current.timer !== null) return;
    current.runningSince = Date.now();
    current.timer = setTimeout(() => {
      this.finish();
    }, current.remainingMs);
  }

  private stopFallback(): void {
    const current = this.current;
    if (current?.timer == null) return;
    clearTimeout(current.timer);
    current.timer = null;
    if (current.runningSince !== null) {
      current.remainingMs = Math.max(0, current.remainingMs - (Date.now() - current.runningSince));
      current.runningSince = null;
    }
  }
}
