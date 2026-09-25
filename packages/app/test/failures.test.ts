// Failure contracts: which failures are corrected, which fall back to text, which surface.

import { Command, INTERRUPT, MemorySaver, NodeTimeoutError, isInterrupted } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { compileStoryGraph } from "../src/graph/story-graph.ts";
import type { SpeechSynthesizer, StructuredModel } from "../src/ports.ts";
import { StoryWriter } from "../src/writer/story-writer.ts";
import { FakeModel, brief, cast, decisions, deps, outline, script } from "../testing/fakes.ts";

describe("story writer corrections", () => {
  it("asks again when the cast leaves out a character from the brief", async () => {
    const withBo = { ...brief, characters: [...brief.characters, { name: "Bo", role: "sidekick" as const, gender: "male" as const, details: "a frog" }] };
    const bo = { ...cast.characters[0], id: "bo", name: "Bo" };
    const model = new FakeModel({ cast_characters: [cast, { characters: [...cast.characters, bo] }] });
    const characters = await new StoryWriter(model).cast(withBo);
    expect(characters.map((c) => c.name)).toEqual(["Pip", "Bo"]);
    expect(model.calls).toEqual(["cast_characters", "cast_characters"]);
  });

  it("rewrites a page with an unknown speaker once, then drops lines that are still invalid", async () => {
    const bad = { page: 1, segments: [...script.segments, { speaker: "ghost", text: "Boo", style: "spooky" }] };
    const model = new FakeModel({ write_page: [bad, bad] });
    const page = await new StoryWriter(model).writePage(brief, cast.characters, outline("x"), 1);
    expect(model.calls).toEqual(["write_page", "write_page"]);
    expect(page.segments.map((s) => s.speaker)).not.toContain("ghost");
    expect(page.segments).toHaveLength(script.segments.length);
  });
});

function setup(overrides: { speech?: SpeechSynthesizer; model?: FakeModel }) {
  const model =
    overrides.model ??
    new FakeModel({
      extract_brief: [brief],
      decide_clarification: [decisions.ask, decisions.ready],
      cast_characters: [cast],
      outline: [outline("First plan")],
      write_page: [script],
    });
  const graph = compileStoryGraph(new MemorySaver());
  const config = {
    configurable: { thread_id: "f" },
    context: { deps: deps({ model, ...(overrides.speech === undefined ? {} : { speech: overrides.speech }) }) },
  };
  return { graph, config, model };
}

describe("text-only fallbacks", () => {
  it("still asks the question, without audio, when question TTS fails", async () => {
    const speech: SpeechSynthesizer = { synthesize: () => Promise.reject(new Error("tts down")) };
    const { graph, config } = setup({ speech });
    const paused = await graph.invoke({ storyId: "f", idea: "Pip" }, config);
    if (!isInterrupted(paused)) throw new Error("expected a question");
    expect(paused[INTERRUPT][0]?.value).toMatchObject({ kind: "clarification", questionAudioUrl: null });
  });

  it("performs the page with a silent line where one segment's TTS fails", async () => {
    const speech: SpeechSynthesizer = {
      synthesize: (request) =>
        request.text === "It was a bad plan."
          ? Promise.reject(new Error("tts down"))
          : Promise.resolve({ wav: new Uint8Array([1]), durationMs: 500 }),
    };
    const { graph, config } = setup({ speech });
    await graph.invoke({ storyId: "f", idea: "Pip" }, config);
    await graph.invoke(new Command({ resume: "Moon cheese" }), config);
    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(done.performance.map((s) => s.audioUrl === null)).toEqual([false, false, true, false]);
  });
});

describe("failures that surface", () => {
  it("rejects the run when the model fails permanently, leaving the thread resumable", async () => {
    const model = new FakeModel({ extract_brief: [] }); // no answer → throws
    const { graph, config } = setup({ model });
    await expect(graph.invoke({ storyId: "f", idea: "Pip" }, config)).rejects.toThrow("no response for extract_brief");
    // The failed node is still pending, so a later invoke(null) would retry it (task 10).
    expect((await graph.getState(config)).next).toEqual(["understand"]);
  });
});

describe("pauses validate what they're given", () => {
  it("asks again, without doing any work, when a resume value doesn't fit", async () => {
    const { graph, config, model } = setup({});
    await graph.invoke({ storyId: "f", idea: "Pip" }, config);
    await graph.invoke(new Command({ resume: "Moon cheese" }), config);
    const calls = model.calls.length;

    const again = await graph.invoke(new Command({ resume: { approved: false, feedback: "   " } }), config);
    if (!isInterrupted(again)) throw new Error("expected the outline review again");
    expect(again[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review" });
    expect(model.calls).toHaveLength(calls); // no revision ran
  });
});

describe("node timeouts", () => {
  it("aborts a hung provider call and fails the run instead of hanging", async () => {
    let aborted = false;
    const hung: StructuredModel = {
      generate: ({ signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("request cancelled"));
          });
        }),
    };
    const graph = compileStoryGraph(new MemorySaver(), { idleTimeoutMs: 50 });
    const config = { configurable: { thread_id: "t" }, context: { deps: deps({ model: hung }) } };
    await expect(graph.invoke({ storyId: "t", idea: "Pip" }, config)).rejects.toBeInstanceOf(NodeTimeoutError);
    expect(aborted).toBe(true);
    expect((await graph.getState(config)).next).toEqual(["understand"]); // retryable later
  });
});
