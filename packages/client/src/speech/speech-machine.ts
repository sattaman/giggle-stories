// "Say it or type it" as a pure state machine: tap to record, tap to stop,
// check the transcript, then send it. Shared by the idea, question and
// outline-feedback screens.

export type SpeechState =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "recording"; readonly startedAt: number }
  | { readonly kind: "transcribing" }
  /** Checking what we heard (source "voice") or typing it in (source "typed"). */
  | { readonly kind: "editing"; readonly text: string; readonly source: "voice" | "typed" }
  | { readonly kind: "problem"; readonly message: string };

export type SpeechEvent =
  | { readonly type: "startRequested" }
  | { readonly type: "recordingStarted"; readonly at: number }
  | { readonly type: "stopRequested" }
  | { readonly type: "transcribed"; readonly text: string }
  | { readonly type: "failed"; readonly message: string }
  | { readonly type: "typeInstead" }
  | { readonly type: "edited"; readonly text: string }
  | { readonly type: "reset" };

export const INITIAL_SPEECH: SpeechState = { kind: "idle" };

export function speechReducer(state: SpeechState, event: SpeechEvent): SpeechState {
  switch (event.type) {
    case "startRequested":
      return state.kind === "recording" || state.kind === "transcribing" ? state : { kind: "starting" };
    case "recordingStarted":
      return state.kind === "starting" ? { kind: "recording", startedAt: event.at } : state;
    case "stopRequested":
      return state.kind === "recording" ? { kind: "transcribing" } : state;
    case "transcribed": {
      if (state.kind !== "transcribing") return state;
      const text = event.text.trim();
      return text === ""
        ? { kind: "problem", message: "I didn't quite catch that. Shall we try again?" }
        : { kind: "editing", text, source: "voice" };
    }
    case "failed":
      // Ignore late failures from a recording the child already walked away from.
      return state.kind === "starting" || state.kind === "recording" || state.kind === "transcribing"
        ? { kind: "problem", message: event.message }
        : state;
    case "typeInstead":
      return { kind: "editing", text: "", source: "typed" };
    case "edited":
      return state.kind === "editing" ? { ...state, text: event.text } : state;
    case "reset":
      return INITIAL_SPEECH;
  }
}

/** "0:07" */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}
