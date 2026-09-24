// One-off clips: the spoken question and each character's "hear my voice" sample.

import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect, useState } from "react";
import { SILENT_AUDIO_PREFIX } from "../api/story-api.ts";

export interface ClipPlayer {
  /** The clip currently playing, if any. */
  readonly playingUrl: string | null;
  readonly play: (url: string) => void;
  readonly stop: () => void;
}

export function useClipPlayer(): ClipPlayer {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [url, setUrl] = useState<string | null>(null);

  // Hush the clip when the screen goes away.
  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {
        // Already released by expo-audio: nothing left to stop.
      }
    },
    [player],
  );

  return {
    playingUrl: status.playing ? url : null,
    play(next: string) {
      if (next.startsWith(SILENT_AUDIO_PREFIX)) return;
      player.replace({ uri: next });
      player.play();
      setUrl(next);
    },
    stop() {
      player.pause();
    },
  };
}
