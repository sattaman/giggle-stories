import { Command, INTERRUPT, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { compileStoryGraph } from "../src/graph/story-graph.ts";
import { FakeModel, FakeVoices, RecordingProgress, brief, cast, decisions, deps, outline, script } from "../testing/fakes.ts";

const pipAsBoy = {
  characters: cast.characters.map((c) => ({ ...c, gender: "male", voiceArchetype: "kid-hero-male", voiceDescription: "A bright, bouncy cartoon hero's voice, male." })),
};

function setup(options: { decide: unknown[]; rejectVoices?: boolean; recast?: unknown; stock?: boolean; library?: boolean }) {
  const model = new FakeModel({
    extract_brief: [brief],
    decide_clarification: options.decide,
    cast_characters: [cast],
    outline: [outline("First plan")],
    revise_outline: [outline("Revised plan")],
    write_page: [script],
    rewrite_voice: [{ voiceDescription: "A bright, bouncy cartoon voice with a British accent." }],
    recast_characters: [options.recast ?? cast],
  });
  const progress = new RecordingProgress();
  const voices = new FakeVoices(options.rejectVoices ?? false);
  const graph = compileStoryGraph(new MemorySaver());
  const config = { configurable: { thread_id: "story-1" }, context: { deps: deps({ model, progress, voices, stockVoices: options.stock === true ? { female: "voice_stock_f" } : {}, voiceLibrary: options.library === true ? { "kid-hero-female": "voice_lib_heroine", "kid-hero-male": "voice_lib_hero" } : {} }) } };
  return { graph, config, model, progress, voices };
}

const start = { storyId: "story-1", idea: "Pip builds a rocket" };

describe("story graph", () => {
  it("asks a question, takes changes to the outline, then performs page one", async () => {
    const { graph, config, model, progress, voices } = setup({ decide: [decisions.ask, decisions.ready], recast: pipAsBoy });

    const first = await graph.invoke(start, config);
    expect(isInterrupted(first)).toBe(true);
    if (!isInterrupted(first)) return;
    expect(first[INTERRUPT][0]?.value).toMatchObject({ kind: "clarification", question: "What is Pip looking for?", round: 1 });

    const second = await graph.invoke(new Command({ resume: "Moon cheese!" }), config);
    if (!isInterrupted(second)) throw new Error("expected outline review");
    expect(second[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review", outline: { storyTitle: "First plan" } });
    expect(second.answers).toEqual([{ question: "What is Pip looking for?", answer: "Moon cheese!" }]);
    expect(second.cast[0]?.voice).toMatchObject({ voiceId: "voice_pip", source: "designed" });

    const third = await graph.invoke(new Command({ resume: { approved: false, feedback: "Pip is a boy" } }), config);
    if (!isInterrupted(third)) throw new Error("expected second outline review");
    expect(third[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review", outline: { storyTitle: "Revised plan" } });
    // The change reached the characters: new gender, and a freshly designed voice for it.
    expect(third.cast[0]).toMatchObject({ gender: "male", voice: { source: "designed" } });
    expect(voices.designed).toHaveLength(2);
    expect(third.answers.at(-1)).toEqual({ question: "Changes the child asked for", answer: "Pip is a boy" });

    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(isInterrupted(done)).toBe(false);
    expect(done.performance).toHaveLength(script.segments.length);
    expect(done.performance.every((s) => s.audioUrl !== null)).toBe(true);
    expect(progress.segments.sort()).toEqual([0, 1, 2, 3]);
    expect(model.calls.filter((t) => t === "decide_clarification")).toHaveLength(2);
    // Drafted before review, redrafted after the outline changed; nothing written after "Yes!".
    expect(model.calls.filter((t) => t === "write_page")).toHaveLength(2);
    expect(model.calls.at(-1)).toBe("write_page");
  });

  it("never asks the same question twice", async () => {
    const { graph, config, model } = setup({ decide: [decisions.ask] });
    await graph.invoke(start, config);
    const next = await graph.invoke(new Command({ resume: "I don't know" }), config);
    if (!isInterrupted(next)) throw new Error("expected outline review");
    expect(next[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review" });
    expect(model.calls.filter((t) => t === "decide_clarification")).toHaveLength(2);
  });

  it("never asks more than two questions", async () => {
    const other = { decision: "ask", reason: "x", question: "Does the rocket have a name?" };
    const third = { decision: "ask", reason: "x", question: "Where does Pip live?" };
    const { graph, config, model } = setup({ decide: [decisions.ask, other, third] });
    await graph.invoke(start, config);
    await graph.invoke(new Command({ resume: "one" }), config);
    const afterSecond = await graph.invoke(new Command({ resume: "two" }), config);
    if (!isInterrupted(afterSecond)) throw new Error("expected outline review");
    expect(afterSecond[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review" });
    expect(model.calls.filter((t) => t === "decide_clarification")).toHaveLength(2);
  });

  it("keeps a character's voice when a change doesn't affect it", async () => {
    const { graph, config, voices } = setup({ decide: [decisions.ready] });
    await graph.invoke(start, config);
    const revised = await graph.invoke(new Command({ resume: { approved: false, feedback: "Make it spookier" } }), config);
    if (!isInterrupted(revised)) throw new Error("expected outline review");
    expect(voices.designed).toHaveLength(1);
    expect(revised.cast[0]?.voice?.voiceId).toBe("voice_pip");
  });

  it("uses the ready-made library voice without designing one", async () => {
    const { graph, config, voices } = setup({ decide: [decisions.ready], library: true });
    const review = await graph.invoke(start, config);
    if (!isInterrupted(review)) throw new Error("expected outline review");
    expect(review.cast[0]?.voice).toMatchObject({ voiceId: "voice_lib_heroine", source: "library" });
    expect(voices.designed).toHaveLength(0);
  });

  it("uses a stock cartoon voice when design is rejected twice", async () => {
    const { graph, config } = setup({ decide: [decisions.ready], rejectVoices: true, stock: true });
    const review = await graph.invoke(start, config);
    if (!isInterrupted(review)) throw new Error("expected outline review");
    expect(review.cast[0]?.voice).toMatchObject({ voiceId: "voice_stock_f", source: "designed" });
  });

  it("falls back to a catalogue voice when voice design is rejected", async () => {
    const { graph, config, model } = setup({ decide: [decisions.ready], rejectVoices: true });
    const review = await graph.invoke(start, config);
    if (!isInterrupted(review)) throw new Error("expected outline review");
    expect(review.cast[0]?.voice).toMatchObject({ voiceId: "catalog_female_0", source: "catalog" });
    expect(model.calls).toContain("rewrite_voice");
  });
});
