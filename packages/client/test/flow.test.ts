import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StoryView } from "@storytime/domain";
import { pollDelayMs, screenFor, shouldPoll } from "../src/story/flow.ts";
import { displayText } from "../src/story/lines.ts";

const base: StoryView = {
  id: "story_abc",
  status: "working",
  stage: "casting",
  message: null,
  idea: "a pirate duck",
  pending: null,
  characters: [],
  title: null,
  performance: null,
  illustrationUrl: null,
  error: null,
  canRetry: false,
};

describe("screenFor", () => {
  it("shows the server's message while working, or a stage default", () => {
    assert.deepEqual(screenFor({ ...base, message: "Giving everyone a voice…" }), { kind: "working", message: "Giving everyone a voice…" });
    assert.deepEqual(screenFor(base), { kind: "working", message: "Inventing your characters…" });
  });

  it("asks the clarification question", () => {
    const view: StoryView = {
      ...base,
      status: "waiting",
      stage: null,
      pending: { kind: "clarification", question: "What's his name?", questionAudioUrl: null, round: 1 },
    };
    assert.deepEqual(screenFor(view), { kind: "clarification", question: "What's his name?", audioUrl: null, round: 1 });
  });

  it("shows the performance while performing, even before any audio exists", () => {
    const performance = { page: 1, segments: [], complete: false };
    assert.deepEqual(screenFor({ ...base, status: "performing", stage: "performing", performance }), { kind: "performance", performance });
  });

  it("shows a friendly error", () => {
    assert.deepEqual(screenFor({ ...base, status: "error", error: "boom" }), { kind: "error", message: "boom", canRetry: false });
    assert.deepEqual(screenFor({ ...base, status: "error", error: "boom", canRetry: true }), { kind: "error", message: "boom", canRetry: true });
  });
});

describe("polling", () => {
  it("polls only while the server is busy", () => {
    assert.equal(shouldPoll(null), true);
    assert.equal(shouldPoll(base), true);
    assert.equal(shouldPoll({ ...base, status: "performing" }), true);
    assert.equal(shouldPoll({ ...base, status: "waiting" }), false);
    assert.equal(shouldPoll({ ...base, status: "done" }), false);
  });

  it("backs off after failures, capped at 10s", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 10].map(pollDelayMs), [1000, 2000, 4000, 8000, 10_000, 10_000]);
  });
});

describe("displayText", () => {
  it("hides vocal tags", () => {
    assert.equal(displayText("Oh no! <gasp> It's   <short pause> cheese."), "Oh no! It's cheese.");
  });
});
