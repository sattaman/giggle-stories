import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordingFilename } from "../src/audio/audio-format.ts";
import { ANSWER_BOX_MAX_HEIGHT, ANSWER_BOX_MIN_HEIGHT, answerBoxHeight } from "../src/speech/speech-machine.ts";

describe("recording upload", () => {
  it("names the file after what the browser recorded", () => {
    assert.equal(recordingFilename("audio/webm;codecs=opus"), "speech.webm");
    assert.equal(recordingFilename("audio/webm"), "speech.webm");
    assert.equal(recordingFilename("audio/mp4"), "speech.m4a");
    assert.equal(recordingFilename("audio/mp4; codecs=mp4a.40.2"), "speech.m4a");
    assert.equal(recordingFilename("audio/ogg;codecs=opus"), "speech.ogg");
    assert.equal(recordingFilename(""), "speech.webm");
  });
});

describe("answer box", () => {
  it("grows with the transcript so none of it is hidden, within limits", () => {
    assert.equal(answerBoxHeight(60), ANSWER_BOX_MIN_HEIGHT);
    assert.equal(answerBoxHeight(300.2), 301);
    assert.equal(answerBoxHeight(5000), ANSWER_BOX_MAX_HEIGHT);
    assert.equal(answerBoxHeight(Number.NaN), ANSWER_BOX_MIN_HEIGHT);
  });
});
