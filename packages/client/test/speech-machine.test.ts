import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatElapsed, INITIAL_SPEECH, speechReducer, type SpeechEvent, type SpeechState } from "../src/speech/speech-machine.ts";

const run = (events: readonly SpeechEvent[], from: SpeechState = INITIAL_SPEECH): SpeechState => events.reduce(speechReducer, from);

describe("speech input", () => {
  it("records, transcribes and lets the child check the words", () => {
    const state = run([
      { type: "startRequested" },
      { type: "recordingStarted", at: 5 },
      { type: "stopRequested" },
      { type: "transcribed", text: "  a pirate duck " },
    ]);
    assert.deepEqual(state, { kind: "editing", text: "a pirate duck", source: "voice" });
  });

  it("asks again when nothing was heard", () => {
    const state = run([{ type: "startRequested" }, { type: "recordingStarted", at: 0 }, { type: "stopRequested" }, { type: "transcribed", text: " " }]);
    assert.equal(state.kind, "problem");
  });

  it("ignores a late transcript after the child switched to typing", () => {
    const state = run([{ type: "startRequested" }, { type: "recordingStarted", at: 0 }, { type: "stopRequested" }, { type: "typeInstead" }, { type: "transcribed", text: "late" }, { type: "failed", message: "late" }]);
    assert.deepEqual(state, { kind: "editing", text: "", source: "typed" });
  });

  it("formats the recording timer", () => {
    assert.equal(formatElapsed(7_400), "0:07");
    assert.equal(formatElapsed(75_000), "1:15");
  });
});
