// Drives the speech machine with the real microphone and the transcription API.

import { useEffect, useReducer, useState } from "react";
import type { StoryApi } from "../api/story-api.ts";
import { MicrophoneError, useRecorder } from "../audio/use-recorder.ts";
import { INITIAL_SPEECH, speechReducer, type SpeechState } from "./speech-machine.ts";

/** Long enough for a rambling idea, short enough to keep uploads small. */
const MAX_RECORDING_MS = 90_000;

export interface SpeechInput {
  readonly state: SpeechState;
  readonly elapsedMs: number;
  readonly startRecording: () => Promise<void>;
  readonly stopRecording: () => Promise<void>;
  readonly typeInstead: () => void;
  readonly edit: (text: string) => void;
  readonly reset: () => void;
}

export function useSpeechInput(api: StoryApi): SpeechInput {
  const recorder = useRecorder();
  const [state, dispatch] = useReducer(speechReducer, INITIAL_SPEECH);
  const [now, setNow] = useState(() => Date.now());
  const recording = state.kind === "recording";

  useEffect(() => {
    if (!recording) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [recording]);

  const elapsedMs = state.kind === "recording" ? Math.max(0, now - state.startedAt) : 0;

  async function startRecording(): Promise<void> {
    dispatch({ type: "startRequested" });
    try {
      await recorder.start();
      const at = Date.now();
      setNow(at);
      dispatch({ type: "recordingStarted", at });
    } catch (error: unknown) {
      dispatch({
        type: "failed",
        message: error instanceof MicrophoneError ? error.message : "The microphone isn't working right now. You can type instead!",
      });
    }
  }

  async function stopRecording(): Promise<void> {
    dispatch({ type: "stopRequested" });
    try {
      const upload = await recorder.stop();
      const text = await api.transcribe(upload);
      dispatch({ type: "transcribed", text });
    } catch (error: unknown) {
      dispatch({
        type: "failed",
        message: error instanceof MicrophoneError ? error.message : "Hmm, I couldn't hear that properly. Try again, or type it!",
      });
    }
  }

  const tooLong = elapsedMs >= MAX_RECORDING_MS;
  useEffect(() => {
    if (tooLong) void stopRecording();
    // stopRecording is recreated every render; the trigger is only `tooLong`.
  }, [tooLong]);

  return {
    state,
    elapsedMs,
    startRecording,
    stopRecording,
    typeInstead: () => {
      dispatch({ type: "typeInstead" });
    },
    edit: (text: string) => {
      dispatch({ type: "edited", text });
    },
    reset: () => {
      dispatch({ type: "reset" });
    },
  };
}
