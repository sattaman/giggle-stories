import { Command, INTERRUPT, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { compileStoryGraph } from "../src/graph/story-graph.ts";
import { FakeModel, FakeVoices, RecordingProgress, brief, cast, decisions, deps, outline, script } from "./fakes.ts";

function setup(options: { decide: unknown[]; rejectVoices?: boolean }) {
  const model = new FakeModel({
    extract_brief: [brief],
    decide_clarification: options.decide,
    cast_characters: [cast],
    outline: [outline("First plan")],
    revise_outline: [outline("Revised plan")],
    write_page: [script],
    rewrite_voice: [{ voiceDescription: "A bright, bouncy cartoon voice with a British accent." }],
  });
  const progress = new RecordingProgress();
  const voices = new FakeVoices(options.rejectVoices ?? false);
  const graph = compileStoryGraph(new MemorySaver());
  const config = { configurable: { thread_id: "story-1" }, context: { deps: deps({ model, progress, voices }) } };
  return { graph, config, model, progress, voices };
}

const start = { storyId: "story-1", idea: "Pip builds a rocket" };

describe("story graph", () => {
  it("asks a question, takes changes to the outline, then performs page one", async () => {
    const { graph, config, model, progress } = setup({ decide: [decisions.ask, decisions.ready] });

    const first = await graph.invoke(start, config);
    expect(isInterrupted(first)).toBe(true);
    if (!isInterrupted(first)) return;
    expect(first[INTERRUPT][0]?.value).toMatchObject({ kind: "clarification", question: "What is Pip looking for?", round: 1 });

    const second = await graph.invoke(new Command({ resume: "Moon cheese!" }), config);
    if (!isInterrupted(second)) throw new Error("expected outline review");
    expect(second[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review", outline: { storyTitle: "First plan" } });
    expect(second.answers).toEqual([{ question: "What is Pip looking for?", answer: "Moon cheese!" }]);
    expect(second.cast[0]?.voice).toMatchObject({ voiceId: "voice_pip", source: "designed" });

    const third = await graph.invoke(new Command({ resume: { approved: false, feedback: "Add a dog" } }), config);
    if (!isInterrupted(third)) throw new Error("expected second outline review");
    expect(third[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review", outline: { storyTitle: "Revised plan" } });

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

  it("never asks more than two questions", async () => {
    const { graph, config, model } = setup({ decide: [decisions.ask] });
    await graph.invoke(start, config);
    await graph.invoke(new Command({ resume: "one" }), config);
    const afterSecond = await graph.invoke(new Command({ resume: "two" }), config);
    if (!isInterrupted(afterSecond)) throw new Error("expected outline review");
    expect(afterSecond[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review" });
    expect(model.calls.filter((t) => t === "decide_clarification")).toHaveLength(2);
  });

  it("falls back to a catalogue voice when voice design is rejected", async () => {
    const { graph, config, model } = setup({ decide: [decisions.ready], rejectVoices: true });
    const review = await graph.invoke(start, config);
    if (!isInterrupted(review)) throw new Error("expected outline review");
    expect(review.cast[0]?.voice).toMatchObject({ voiceId: "catalog_female_0", source: "catalog" });
    expect(model.calls).toContain("rewrite_voice");
  });
});
