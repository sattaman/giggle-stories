// Checkpoint behaviour: what survives a restart, what re-runs, and how forks branch.
// Node-level tests can't show any of this; it only exists when the whole graph runs
// against a checkpointer.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Annotation,
  Command,
  END,
  INTERRUPT,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  isInterrupted,
  type StateSnapshot,
} from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { Outline, PerformedSegment } from "@storytime/domain";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileStoryGraph } from "../src/graph/story-graph.ts";
import type { SpeechSynthesizer, StoryDeps, StructuredModel, VoiceDesigner } from "../src/ports.ts";
import { SyntheticModel, syntheticDeps, syntheticStart } from "../testing/synthetic.ts";
import { FakeVoices, cast } from "../testing/fakes.ts";

const Values = z.object({ outline: Outline.optional(), performance: z.array(PerformedSegment) });
function countingSpeech(onCall: () => void): SpeechSynthesizer {
  return {
    synthesize: () => {
      onCall();
      return Promise.resolve({ wav: new Uint8Array([1]), durationMs: 1000 });
    },
  };
}

const valuesOf = (snapshot: StateSnapshot) => Values.parse(snapshot.values);

async function historyOf(graph: ReturnType<typeof compileStoryGraph>, threadId: string): Promise<StateSnapshot[]> {
  const snapshots: StateSnapshot[] = [];
  for await (const snapshot of graph.getStateHistory({ configurable: { thread_id: threadId } })) snapshots.unshift(snapshot);
  return snapshots;
}

/** A fresh "process": new graph, new fakes, same checkpointer. */
function session(saver: SqliteSaver | MemorySaver, threadId: string) {
  const model = new SyntheticModel();
  const voices = new FakeVoices();
  const graph = compileStoryGraph(saver);
  const config = { configurable: { thread_id: threadId }, context: { deps: syntheticDeps({ model, voices }) } };
  return { graph, config, model, voices };
}

async function toOutlineReview(s: ReturnType<typeof session>) {
  await s.graph.invoke({ ...syntheticStart, storyId: s.config.configurable.thread_id }, s.config);
  const review = await s.graph.invoke(new Command({ resume: "Moon cheese" }), s.config);
  if (!isInterrupted(review)) throw new Error("expected outline review");
  return review;
}

describe("checkpoints", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "storytime-checkpoints-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("records one checkpoint per superstep, with parallel nodes sharing a step", async () => {
    const s = session(new MemorySaver(), "history");
    await toOutlineReview(s);
    const steps = (await historyOf(s.graph, "history")).map((snap) => `${String(snap.metadata?.step)}:${snap.next.join("+")}`);
    expect(steps).toEqual([
      "-1:__start__",
      "0:understand",
      "1:askQuestion",
      "2:understand",
      "3:castCharacters",
      "4:designVoices+planOutline",
      "5:draftPage",
      "6:reviewOutline",
    ]);
  });

  it("resumes an approval after SQLite is closed and reopened, without redoing earlier work", async () => {
    const file = join(dir, "checkpoints.sqlite");
    const before = SqliteSaver.fromConnString(file);
    await toOutlineReview(session(before, "restart"));
    before.db.close(); // the process "dies" while waiting for the child

    const after = session(SqliteSaver.fromConnString(file), "restart");
    const done = await after.graph.invoke(new Command({ resume: { approved: true } }), after.config);

    expect(isInterrupted(done)).toBe(false);
    expect(done.performance).toHaveLength(4);
    // Casting, voices, outline and page were checkpointed before the pause: none re-ran.
    expect(after.model.calls).toEqual([]);
    expect(after.voices.designed).toEqual([]);
  });

  it("replays the stored answer when an already-answered checkpoint is resumed again", async () => {
    const s = session(new MemorySaver(), "replay");
    await toOutlineReview(s);
    const atReview = await s.graph.getState(s.config);
    await s.graph.invoke(new Command({ resume: { approved: true } }), s.config);

    // The approval was saved as a pending __resume__ write on the review checkpoint. Resuming
    // that checkpoint again ignores the new answer, replays the approval and re-performs the page.
    let performed = 0;
    const replayed = await s.graph.invoke(new Command({ resume: { approved: false, feedback: "Make it spookier" } }), {
      ...atReview.config,
      context: { deps: syntheticDeps({ speech: countingSpeech(() => (performed += 1)) }) },
    });
    expect(isInterrupted(replayed)).toBe(false);
    expect(valuesOf(await s.graph.getState(s.config)).outline?.storyTitle).toBe("First plan");
    expect(performed).toBe(4); // paid TTS again, in production
  });

  it("forks from the outline-review checkpoint without changing the original branch", async () => {
    const s = session(new MemorySaver(), "fork");
    await toOutlineReview(s);
    const atReview = await s.graph.getState(s.config);
    await s.graph.invoke(new Command({ resume: { approved: true } }), s.config);
    const original = await s.graph.getState(s.config);

    // updateState on an old checkpoint writes a new one (a fork) with no stored answer yet.
    const forkConfig = await s.graph.updateState(atReview.config, {});
    expect((await s.graph.getState(forkConfig)).next).toEqual(["reviewOutline"]);
    const fresh = new SyntheticModel();
    const forked = await s.graph.invoke(new Command({ resume: { approved: false, feedback: "Make it spookier" } }), {
      ...forkConfig,
      context: { deps: syntheticDeps({ model: fresh }) },
    });
    if (!isInterrupted(forked)) throw new Error("expected the fork to reach review again");
    expect(forked[INTERRUPT][0]?.value).toMatchObject({ outline: { storyTitle: "Revised plan" } });
    // Only the revision path ran on the fork; nothing before the review repeated.
    expect(fresh.calls).toEqual(["extract_brief", "revise_outline", "recast_characters", "write_page"]);

    // The approved branch is still there, unchanged, under its own checkpoint id.
    const stillOriginal = valuesOf(await s.graph.getState(original.config));
    expect(stillOriginal.outline?.storyTitle).toBe("First plan");
    expect(stillOriginal.performance).toHaveLength(4);
    // The thread's head is now the fork, which has not been performed.
    const head = await s.graph.getState(s.config);
    expect(head.config.configurable?.["checkpoint_id"]).not.toBe(original.config.configurable?.["checkpoint_id"]);
    expect(valuesOf(head).performance).toHaveLength(0);
  });
});

describe("interrupt nodes re-run from the top on resume", () => {
  it("runs code before interrupt() twice: once to pause, once to resume", async () => {
    let entered = 0;
    const State = Annotation.Root({ answer: Annotation<string> });
    const graph = new StateGraph(State)
      .addNode("ask", () => {
        entered += 1; // imagine this were a paid TTS call
        return { answer: interrupt<string, string>("question?") };
      })
      .addEdge(START, "ask")
      .addEdge("ask", END)
      .compile({ checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: "counter" } };

    await graph.invoke({ answer: "" }, config);
    expect(entered).toBe(1);
    const done = await graph.invoke(new Command({ resume: "yes" }), config);
    expect(done.answer).toBe("yes");
    expect(entered).toBe(2); // why the story graph keeps side effects out of askQuestion/reviewOutline
  });
});

describe("paid calls are durable tasks", () => {
  /** Resolves when `release` is called; lets a test stall one provider call until the node times out. */
  function stall() {
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { released, release };
  }

  /** Wraps a provider call so the first call matching `shouldStall` never answers. */
  function stallable<A extends unknown[], R>(fn: (...args: A) => Promise<R>, shouldStall: (...args: A) => boolean) {
    const gate = stall();
    let stalled = false;
    const calls: A[] = [];
    const wrapped = (...args: A): Promise<R> => {
      calls.push(args);
      if (!stalled && shouldStall(...args)) {
        stalled = true;
        return gate.released.then(() => Promise.reject(new Error("never answered")));
      }
      return fn(...args);
    };
    return { wrapped, calls };
  }

  async function failsThenRetries(deps: StoryDeps, before: (graph: ReturnType<typeof compileStoryGraph>, config: RunConfig) => Promise<void>) {
    const graph = compileStoryGraph(new MemorySaver(), { idleTimeoutMs: 100 });
    const config: RunConfig = { configurable: { thread_id: "durable" }, context: { deps } };
    await before(graph, config);
    return { graph, config };
  }

  interface RunConfig {
    configurable: { thread_id: string };
    context: { deps: StoryDeps };
  }

  it("re-synthesises only the unfinished lines when performing the page is retried", async () => {
    const speech = stallable(
      (request: Parameters<SpeechSynthesizer["synthesize"]>[0]) => Promise.resolve({ wav: new Uint8Array([request.text.length]), durationMs: 500 }),
      (request) => request.text === "It was a bad plan.",
    );
    const deps = syntheticDeps({ speech: { synthesize: speech.wrapped } });
    const { graph, config } = await failsThenRetries(deps, async (g, c) => {
      await g.invoke({ ...syntheticStart, storyId: "durable" }, c);
      await g.invoke(new Command({ resume: "Moon cheese" }), c);
    });
    const before = speech.calls.length;

    // Line 2 never answers, so performPage times out after lines 0, 1 and 3 have been saved.
    await expect(graph.invoke(new Command({ resume: { approved: true } }), config)).rejects.toBeDefined();
    expect(speech.calls.length - before).toBe(4);

    // "Try again": the three finished lines are restored from their task results.
    const done = await graph.invoke(null, config);
    expect(speech.calls.length - before).toBe(5);
    expect(speech.calls.at(-1)?.[0].text).toBe("It was a bad plan.");
    expect(done.performance.every((s) => s.audioUrl !== null)).toBe(true);
  });

  it("repeats only the unfinished model call when a node is retried", async () => {
    const inner = new SyntheticModel();
    const model = stallable(
      (request: Parameters<StructuredModel["generate"]>[0]): Promise<unknown> => inner.generate(request),
      (request) => request.task === "decide_clarification",
    );
    const stalling: StructuredModel = {
      generate: async <S extends z.ZodType>(request: Parameters<StructuredModel["generate"]>[0] & { readonly schema: S }) =>
        request.schema.parse(await model.wrapped(request)),
    };
    const { graph, config } = await failsThenRetries(syntheticDeps({ model: stalling }), async (g, c) => {
      await expect(g.invoke({ ...syntheticStart, storyId: "durable" }, c)).rejects.toBeDefined(); // decide never answers
    });
    expect(model.calls.map(([r]) => r.task)).toEqual(["extract_brief", "decide_clarification"]);

    const retried = await graph.invoke(null, config);
    expect(isInterrupted(retried)).toBe(true);
    // extract_brief was restored from its task result; only the stalled decision was asked again.
    expect(model.calls.map(([r]) => r.task)).toEqual(["extract_brief", "decide_clarification", "decide_clarification"]);
  });

  it("keeps finished characters' voices when voice design is retried", async () => {
    const bo = { ...cast.characters[0], id: "bo", name: "Bo", hello: "Ribbit!" };
    const inner = new SyntheticModel();
    const twoCharacters: StructuredModel = {
      generate: async (request) => (request.task === "cast_characters" ? request.schema.parse({ characters: [...cast.characters, bo] }) : inner.generate(request)),
    };
    const voices = new FakeVoices();
    const design = stallable((request: Parameters<VoiceDesigner["design"]>[0]) => voices.design(request), (request) => request.name === "Bo");
    const deps = syntheticDeps({ model: twoCharacters, voices: { design: design.wrapped, fallback: (g, i) => voices.fallback(g, i) } });
    const { graph, config } = await failsThenRetries(deps, async (g, c) => {
      await g.invoke({ ...syntheticStart, storyId: "durable" }, c);
      await expect(g.invoke(new Command({ resume: "Moon cheese" }), c)).rejects.toBeDefined(); // Bo's design never answers
    });
    expect(design.calls.map(([r]) => r.name)).toEqual(["Pip", "Bo"]);

    const review = await graph.invoke(null, config);
    expect(isInterrupted(review)).toBe(true);
    expect(design.calls.map(([r]) => r.name)).toEqual(["Pip", "Bo", "Bo"]); // Pip's voice was restored
    expect(review.cast.map((c) => c.voice?.voiceId)).toEqual(["voice_pip", "voice_bo"]);
  });
});
