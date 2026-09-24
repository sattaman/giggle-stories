import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { playbackReducer, type PlaybackEvent, type PlaybackState, type Track } from "../src/story/playback.ts";

const track = (ready: boolean[], complete = false): Track => ({ ready, complete });

function run(events: readonly PlaybackEvent[], t: Track, from: PlaybackState = { phase: "ready" }): PlaybackState {
  return events.reduce((state, event) => playbackReducer(state, event, t), from);
}

describe("playback queue", () => {
  it("starts on the first line when its audio is ready", () => {
    assert.deepEqual(run([{ type: "start" }], track([true, false])), { phase: "playing", index: 0, run: 1 });
  });

  it("waits for a line without audio, then plays it when it arrives", () => {
    const waiting = run([{ type: "start" }, { type: "segmentEnded", index: 0, run: 1 }], track([true, false]));
    assert.deepEqual(waiting, { phase: "waiting", index: 1, run: 1 });
    const resumed = playbackReducer(waiting, { type: "segmentsChanged" }, track([true, true]));
    assert.deepEqual(resumed, { phase: "playing", index: 1, run: 1 });
  });

  it("skips lines the server couldn't voice once the performance is complete", () => {
    const t = track([true, false, true], true);
    const next = run([{ type: "start" }, { type: "segmentEnded", index: 0, run: 1 }], t);
    assert.deepEqual(next, { phase: "playing", index: 2, run: 1 });
    assert.deepEqual(run([{ type: "start" }], track([false, false], true)), { phase: "finished", run: 1 });
  });

  it("waits for more lines until the performance is complete, then finishes", () => {
    const events: PlaybackEvent[] = [{ type: "start" }, { type: "segmentEnded", index: 0, run: 1 }];
    assert.deepEqual(run(events, track([true])), { phase: "waiting", index: 1, run: 1 });
    assert.deepEqual(run(events, track([true], true)), { phase: "finished", run: 1 });
  });

  it("ignores stale 'ended' events from an earlier line or play-through", () => {
    const playing: PlaybackState = { phase: "playing", index: 1, run: 2 };
    const t = track([true, true, true]);
    assert.equal(playbackReducer(playing, { type: "segmentEnded", index: 0, run: 2 }, t), playing);
    assert.equal(playbackReducer(playing, { type: "segmentEnded", index: 1, run: 1 }, t), playing);
  });

  it("pauses and resumes on the same line", () => {
    const t = track([true, true]);
    const paused = run([{ type: "start" }, { type: "pause" }], t);
    assert.deepEqual(paused, { phase: "paused", index: 0, run: 1 });
    assert.deepEqual(playbackReducer(paused, { type: "resume" }, t), { phase: "playing", index: 0, run: 1 });
  });

  it("a line that ends while paused moves on but stays paused", () => {
    const t = track([true, true]);
    const paused: PlaybackState = { phase: "paused", index: 0, run: 1 };
    assert.deepEqual(playbackReducer(paused, { type: "segmentEnded", index: 0, run: 1 }, t), { phase: "paused", index: 1, run: 1 });
  });

  it("replays from the top with a new run number", () => {
    const t = track([true, true], true);
    const finished: PlaybackState = { phase: "finished", run: 1 };
    assert.deepEqual(playbackReducer(finished, { type: "start" }, t), { phase: "playing", index: 0, run: 2 });
  });
});
