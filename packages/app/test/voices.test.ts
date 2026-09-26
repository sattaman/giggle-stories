// Voice assignment across casting and recasting, with several characters.
// These pin the behaviour the Send refactor (task 7) must preserve.

import { Command, MemorySaver, isInterrupted } from "@langchain/langgraph";
import type { CharacterProfile } from "@storytime/domain";
import { describe, expect, it } from "vitest";
import { compileStoryGraph } from "../src/graph/story-graph.ts";
import { FakeModel, FakeVoices, brief, cast, decisions, deps, outline, script } from "../testing/fakes.ts";

const [pip] = cast.characters;
if (pip === undefined) throw new Error("fixture cast is empty");
const bo: CharacterProfile = {
  ...pip,
  id: "bo",
  name: "Bo",
  role: "sidekick",
  emoji: "🐸",
  hello: "Ribbit! I'm Bo!",
  voiceDescription: "A croaky, gravelly cartoon frog voice, slow and deadpan.",
};
const pipAndBo = { characters: [pip, bo] };
const library = { "kid-hero-female": "voice_lib_heroine", "kid-hero-male": "voice_lib_hero" } as const;

async function toReview(options: { recast?: unknown; library?: boolean }) {
  const model = new FakeModel({
    extract_brief: [brief],
    decide_clarification: [decisions.ready],
    cast_characters: [pipAndBo],
    outline: [outline("First plan")],
    revise_outline: [outline("Revised plan")],
    write_page: [script],
    recast_characters: [options.recast ?? pipAndBo],
  });
  const voices = new FakeVoices();
  const graph = compileStoryGraph(new MemorySaver());
  const config = {
    configurable: { thread_id: "voices" },
    context: { deps: deps({ model, voices, voiceLibrary: options.library === true ? library : {} }) },
  };
  const review = await graph.invoke({ storyId: "voices", idea: "Pip and Bo" }, config);
  if (!isInterrupted(review)) throw new Error("expected outline review");
  const revise = async (feedback: string) => {
    const revised = await graph.invoke(new Command({ resume: { approved: false, feedback } }), config);
    if (!isInterrupted(revised)) throw new Error("expected outline review");
    return revised;
  };
  return { review, revise, voices };
}

const voiceOf = (state: { cast: { id: string; voice?: { voiceId: string; source: string } | undefined }[] }, id: string) =>
  state.cast.find((c) => c.id === id)?.voice;

describe("voice assignment", () => {
  it("never gives two characters the same library voice", async () => {
    // Pip and Bo share the kid-hero-female archetype; only one library voice exists for it.
    const { review, voices } = await toReview({ library: true });
    expect(voiceOf(review, "pip")).toMatchObject({ voiceId: "voice_lib_heroine", source: "library" });
    expect(voiceOf(review, "bo")).toMatchObject({ voiceId: "voice_bo", source: "designed" });
    expect(voices.designed).toHaveLength(1);
  });

  it("keeps cast order and assigns each character its own voice", async () => {
    const { review } = await toReview({});
    expect(review.cast.map((c) => [c.id, c.voice?.voiceId])).toEqual([
      ["pip", "voice_pip"],
      ["bo", "voice_bo"],
    ]);
    expect(review.cast.map((c) => c.voice?.sampleUrl)).toEqual(["/audio/voices/voice-pip.wav", "/audio/voices/voice-bo.wav"]);
  });

  it("re-voices only the character whose voice changed", async () => {
    const boAsBoy = { ...bo, gender: "male" as const, voiceArchetype: "kid-hero-male" as const };
    const { revise, voices } = await toReview({ recast: { characters: [pip, boAsBoy] } });
    const revised = await revise("Bo is a boy");
    expect(voiceOf(revised, "pip")).toMatchObject({ voiceId: "voice_pip" });
    expect(revised.cast.find((c) => c.id === "bo")).toMatchObject({ gender: "male", voice: { source: "designed" } });
    // The new sample gets a round suffix so it doesn't overwrite the old clip.
    expect(revised.cast.find((c) => c.id === "bo")?.voice?.sampleUrl).toBe("/audio/voices/voice-bo-r1.wav");
    expect(voices.designed).toHaveLength(3); // pip, bo, then bo again
  });

  it("won't hand a changed character a library voice a kept character already has", async () => {
    // Pip keeps voice_lib_heroine; Bo becomes a kid-hero-female too and must not share it.
    const boAsHeroine = { ...bo, voiceArchetype: "kid-hero-female" as const, voiceDescription: "A bright, bouncy cartoon heroine voice." };
    const { revise } = await toReview({ library: true, recast: { characters: [pip, boAsHeroine] } });
    const revised = await revise("Bo sounds like a hero");
    expect(voiceOf(revised, "pip")).toMatchObject({ voiceId: "voice_lib_heroine", source: "library" });
    expect(voiceOf(revised, "bo")?.voiceId).not.toBe("voice_lib_heroine");
  });

  it("gives a character a genuinely new voice when only the voice description changes", async () => {
    // As in a real session: "Amber sounds a bit like an adult". The recast kept the voice type
    // (so the library had the same voice for it) and rewrote only the description.
    const pipSoundsDifferent = { ...pip, voiceDescription: "A bright, brisk, bouncy cartoon voice with a casual British accent." };
    const { review, revise } = await toReview({ library: true, recast: { characters: [pipSoundsDifferent, bo] } });
    expect(voiceOf(review, "pip")).toMatchObject({ voiceId: "voice_lib_heroine", source: "library" });

    const revised = await revise("Pip sounds too grown-up");
    expect(voiceOf(revised, "pip")?.voiceId).not.toBe("voice_lib_heroine");
    expect(voiceOf(revised, "pip")).toMatchObject({ source: "designed" });
  });

  it("drops removed characters and voices added ones", async () => {
    const zed: CharacterProfile = { ...bo, id: "zed", name: "Zed", hello: "Zzz." };
    const { revise } = await toReview({ recast: { characters: [pip, zed] } });
    const revised = await revise("Swap Bo for Zed");
    expect(revised.cast.map((c) => c.id)).toEqual(["pip", "zed"]);
    expect(voiceOf(revised, "zed")).toMatchObject({ voiceId: "voice_zed", source: "designed" });
  });
});
