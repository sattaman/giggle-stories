// Tap-to-start / tap-to-stop microphone recording on top of expo-audio.

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useEffect } from "react";
import { Platform } from "react-native";
import type { AudioUpload } from "../api/story-api.ts";
import { recordingUpload } from "./recording-upload.ts";

export class MicrophoneError extends Error {
  override readonly name = "MicrophoneError";
}

export interface Recorder {
  /** Asks for the mic if needed and starts recording. Throws MicrophoneError. */
  start(): Promise<void>;
  /** Stops and returns the recording, ready to upload. */
  stop(): Promise<AudioUpload>;
}

export function useRecorder(): Recorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Never leave the microphone on when the screen goes away.
  useEffect(
    () => () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => undefined);
      }
    },
    [recorder],
  );

  return {
    async start() {
      const permission = await requestRecordingPermissionsAsync().catch(() => null);
      if (permission?.granted !== true) {
        throw new MicrophoneError("I can't hear you yet. Ask a grown-up to allow the microphone, or type instead.");
      }
      try {
        if (Platform.OS !== "web") await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        // Must run before every recording: on web the recorder resets after stop().
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch {
        throw new MicrophoneError("The microphone isn't working right now. You can type instead!");
      }
    },
    async stop() {
      await recorder.stop();
      // Back to loud playback through the speaker on iOS.
      if (Platform.OS !== "web") await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const uri = recorder.uri;
      if (uri === null) throw new MicrophoneError("Oops, the recording got lost. Let's try again!");
      return recordingUpload(uri);
    },
  };
}
