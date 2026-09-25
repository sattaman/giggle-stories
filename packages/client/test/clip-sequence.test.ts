import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Character, NarrationClips } from "@storytime/domain";
import { silentDurationMs, silentUrl } from "../src/api/story-api.ts";
import {
  currentClip,
  INITIAL_SEQUENCE,
  isVoiceIntroClip,
  sequenceReducer,
  voiceIntroClips,
  type SequenceClip,
  type SequenceEvent,
  type SequenceState,
} from "../src/story/clip-sequence.ts";

const clip = (key: string, url: string | null = `http://x/${key}.wav`): SequenceClip => ({ key, url, durationMs: null });
const A = clip("a");
const B = clip("b");
const C = clip("c");

function run(events: readonly SequenceEvent[], from: SequenceState = INITIAL_SEQUENCE): SequenceState {
  return events.reduce(sequenceReducer, from);
}

describe("clip sequence", () => {
  it("plays each clip in order, then finishes", () => {
    const clips = [A, B];
    const first = run([{ type: "start", clips }]);
    assert.deepEqual(first, { phase: "playing", clips, index: 0, run: 1 });
    const second = sequenceReducer(first, { type: "clipEnded", index: 0, run: 1 });
    assert.equal(currentClip(second), B);
    assert.deepEqual(sequenceReducer(second, { type: "clipEnded", index: 1, run: 1 }), { phase: "finished", clips, run: 1 });
  });

  it("skips clips without a URL, including at the start and the end", () => {
    const clips = [clip("x", null), A, clip("y", null), B, clip("z", null)];
    const first = run([{ type: "start", clips }]);
    assert.equal(currentClip(first), A);
    const second = sequenceReducer(first, { type: "clipEnded", index: 1, run: 1 });
    assert.equal(currentClip(second), B);
    assert.equal(sequenceReducer(second, { type: "clipEnded", index: 3, run: 1 }).phase, "finished");
    assert.equal(run([{ type: "start", clips: [clip("n", null)] }]).phase, "finished");
    assert.equal(run([{ type: "start", clips: [] }]).phase, "finished");
  });

  it("stops without moving on, and ignores the stopped clip's late 'ended'", () => {
    const clips = [A, B];
    const stopped = run([{ type: "start", clips }, { type: "stop" }]);
    assert.deepEqual(stopped, { phase: "stopped", clips, run: 1 });
    assert.equal(currentClip(stopped), null);
    assert.equal(sequenceReducer(stopped, { type: "clipEnded", index: 0, run: 1 }), stopped);
    assert.equal(run([{ type: "stop" }]), INITIAL_SEQUENCE);
  });

  it("a new playlist replaces the current one, and stale 'ended' events are ignored", () => {
    const playing = run([{ type: "start", clips: [A, B] }, { type: "start", clips: [C] }]);
    assert.deepEqual(playing, { phase: "playing", clips: [C], index: 0, run: 2 });
    assert.equal(sequenceReducer(playing, { type: "clipEnded", index: 0, run: 1 }), playing);
    const onSecond = run([{ type: "start", clips: [A, B] }, { type: "clipEnded", index: 0, run: 1 }]);
    assert.equal(sequenceReducer(onSecond, { type: "clipEnded", index: 0, run: 1 }), onSecond);
  });

  it("skip moves straight to the next clip that has audio", () => {
    const clips = [A, clip("x", null), B];
    const skipped = run([{ type: "start", clips }, { type: "skip" }]);
    assert.equal(currentClip(skipped), B);
    assert.equal(sequenceReducer(skipped, { type: "skip" }).phase, "finished");
    const finished = run([{ type: "start", clips: [] }]);
    assert.equal(sequenceReducer(finished, { type: "skip" }), finished);
  });

  it("replays from the top with a new run number", () => {
    const clips = [A];
    const finished = run([{ type: "start", clips }, { type: "clipEnded", index: 0, run: 1 }]);
    assert.deepEqual(sequenceReducer(finished, { type: "start", clips }), { phase: "playing", clips, index: 0, run: 2 });
  });
});

describe("voice introductions", () => {
  const character = (id: string, sampleUrl: string | null): Character => ({
    id,
    name: id,
    role: "hero",
    emoji: "🦆",
    colour: "#FFB020",
    personality: "",
    comicTrait: "",
    hello: `Hi, I'm ${id}!`,
    gender: "neutral",
    voiceArchetype: "creature-neutral",
    voiceDescription: "A booming, gravelly pirate voice with a quack.",
    voice: { voiceId: id, source: "designed", sampleUrl },
  });
  const narration: NarrationClips = {
    clips: {
      welcome: null,
      idea: null,
      thinking: null,
      voices_intro: "http://x/intro.wav",
      voices_outro: silentUrl("outro", 3000),
      changing: null,
      ready: null,
      the_end: null,
    },
  };

  it("is the narrator's intro, each hello in order, then the outro", () => {
    const clips = voiceIntroClips([character("rolo", "http://x/rolo.wav"), character("pip", null)], narration);
    assert.deepEqual(clips, [
      { key: "narration:voices_intro", url: "http://x/intro.wav", durationMs: null },
      { key: "hello:rolo", url: "http://x/rolo.wav", durationMs: null },
      { key: "hello:pip", url: null, durationMs: null },
      { key: "narration:voices_outro", url: "silent:outro?ms=3000", durationMs: 3000 },
    ]);
    // Pip has no voice sample: the sequence goes straight from Rolo to the outro.
    const onRolo = run([{ type: "start", clips }, { type: "clipEnded", index: 0, run: 1 }]);
    assert.equal(currentClip(onRolo)?.key, "hello:rolo");
    assert.equal(currentClip(sequenceReducer(onRolo, { type: "clipEnded", index: 1, run: 1 }))?.key, "narration:voices_outro");
  });

  it("without narration it's just the hellos", () => {
    const clips = voiceIntroClips([character("rolo", "http://x/rolo.wav")], null);
    assert.deepEqual(
      clips.filter((c) => c.url !== null).map((c) => c.key),
      ["hello:rolo"],
    );
  });

  it("knows which clips belong to the introductions", () => {
    assert.equal(isVoiceIntroClip("hello:rolo"), true);
    assert.equal(isVoiceIntroClip("narration:voices_outro"), true);
    assert.equal(isVoiceIntroClip("narration:welcome"), false);
  });

  it("silent placeholder URLs carry their own length", () => {
    assert.equal(silentDurationMs(silentUrl("hello-rolo", 2400.4)), 2400);
    assert.equal(silentDurationMs("silent:3"), null);
    assert.equal(silentDurationMs("http://x/a.wav?ms=5"), null);
  });
});
