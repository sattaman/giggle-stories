// The story runner with the real graph and synthetic dependencies: overlapping and stale
// replies, failures, and what a restarted server shows. See ADR 0002 for the policy.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { compileStoryGraph, type SpeechSynthesizer, type StructuredModel } from "@storytime/app";
import { SyntheticModel, syntheticDeps } from "@storytime/app/testing";
import type { StoryView } from "@storytime/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StoryIndex } from "../src/story-index.ts";
import { GraphStoryService, StoryConflictError, StoryNotFoundError } from "../src/story-service.ts";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "storytime-service-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A model that fails one task, or waits for `release()` before answering it. */
function controllableModel(options: { failOn?: string; holdOn?: string } = {}) {
  const inner = new SyntheticModel();
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model: StructuredModel = {
    generate: async (request) => {
      if (request.task === options.failOn) throw new Error(`provider down during ${request.task}`);
      if (request.task === options.holdOn) await held;
      return inner.generate(request);
    },
  };
  return { model, calls: inner.calls, release };
}

function countingSpeech() {
  let calls = 0;
  const speech: SpeechSynthesizer = {
    synthesize: () => {
      calls += 1;
      return Promise.resolve({ wav: new Uint8Array([1]), durationMs: 500 });
    },
  };
  return { speech, calls: () => calls };
}

function service(options: { model?: StructuredModel; speech?: SpeechSynthesizer; saver?: BaseCheckpointSaver } = {}) {
  const saver = options.saver ?? new MemorySaver();
  // The service replaces `progress` with itself.
  const deps = syntheticDeps({
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.speech === undefined ? {} : { speech: options.speech }),
  });
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const stories = new GraphStoryService(compileStoryGraph(saver), deps, silent, new StoryIndex(dir, join(dir, "audio")));
  return { stories, saver };
}

/** Polls until the background run settles (not working/performing). */
async function settled(stories: GraphStoryService, id: string): Promise<StoryView> {
  for (let i = 0; i < 200; i++) {
    const view = await stories.view(id);
    if (view.status !== "working" && view.status !== "performing") return view;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("story never settled");
}

async function toOutlineReview(stories: GraphStoryService): Promise<string> {
  const { id } = await stories.start("Pip builds a rocket out of a bin", "5-8");
  expect((await settled(stories, id)).pending?.kind).toBe("clarification");
  await stories.reply(id, { kind: "answer", text: "Moon cheese" });
  expect((await settled(stories, id)).pending?.kind).toBe("outline_review");
  return id;
}

describe("GraphStoryService", () => {
  it("runs a story from idea to performed page", async () => {
    const { stories } = service();
    const id = await toOutlineReview(stories);
    await stories.reply(id, { kind: "outline", approved: true });
    const done = await settled(stories, id);
    expect(done.status).toBe("done");
    expect(done.performance?.segments.every((s) => s.audioUrl !== null)).toBe(true);
    expect((await stories.list()).map((s) => [s.id, s.status])).toEqual([[id, "done"]]);
  });

  it("accepts exactly one of two simultaneous approvals and performs the page once", async () => {
    const tts = countingSpeech();
    const { stories } = service({ speech: tts.speech });
    const id = await toOutlineReview(stories);
    const before = tts.calls();

    const results = await Promise.allSettled([
      stories.reply(id, { kind: "outline", approved: true }),
      stories.reply(id, { kind: "outline", approved: true }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(StoryConflictError);

    expect((await settled(stories, id)).status).toBe("done");
    expect(tts.calls() - before).toBe(4); // one performance, not two
  });

  it("rejects a reply while the story is working", async () => {
    const gate = controllableModel({ holdOn: "write_page" });
    const { stories } = service({ model: gate.model });
    const { id } = await stories.start("Pip", "5-8");
    await settled(stories, id);
    await stories.reply(id, { kind: "answer", text: "Moon cheese" });
    await expect(stories.reply(id, { kind: "outline", approved: true })).rejects.toBeInstanceOf(StoryConflictError);
    gate.release();
    expect((await settled(stories, id)).pending?.kind).toBe("outline_review");
  });

  it("rejects a repeated approval after the story has finished, without re-running anything", async () => {
    const tts = countingSpeech();
    const { stories } = service({ speech: tts.speech });
    const id = await toOutlineReview(stories);
    await stories.reply(id, { kind: "outline", approved: true });
    await settled(stories, id);
    const after = tts.calls();

    await expect(stories.reply(id, { kind: "outline", approved: true })).rejects.toBeInstanceOf(StoryConflictError);
    expect(tts.calls()).toBe(after);
    expect((await stories.view(id)).status).toBe("done");
  });

  it("rejects a reply of the wrong kind", async () => {
    const { stories } = service();
    const { id } = await stories.start("Pip", "5-8");
    await settled(stories, id);
    await expect(stories.reply(id, { kind: "outline", approved: true })).rejects.toThrow("Expected an answer");
  });

  it("shows a failed run as an error that cannot currently be retried", async () => {
    const { stories } = service({ model: controllableModel({ failOn: "write_page" }).model });
    const { id } = await stories.start("Pip", "5-8");
    await settled(stories, id);
    await stories.reply(id, { kind: "answer", text: "Moon cheese" });

    const failed = await settled(stories, id);
    expect(failed).toMatchObject({ status: "error", error: "Oops, the story machine got in a muddle. Let's try again!" });
    // Gap (ADR 0002): the checkpoint still has draftPage due, but no API resumes it.
    await expect(stories.reply(id, { kind: "outline", approved: true })).rejects.toBeInstanceOf(StoryConflictError);
  });

  it("shows an unfinished story as interrupted after a server restart", async () => {
    const saver = new MemorySaver();
    const first = service({ model: controllableModel({ failOn: "write_page" }).model, saver });
    const { id } = await first.stories.start("Pip", "5-8");
    await settled(first.stories, id);
    await first.stories.reply(id, { kind: "answer", text: "Moon cheese" });
    await settled(first.stories, id);

    const restarted = service({ saver }); // same checkpoints, empty in-memory progress
    expect(await restarted.stories.view(id)).toMatchObject({
      status: "error",
      error: "This story got interrupted. Let's make a new one!",
      characters: [{ name: "Pip" }], // the work so far is still there
    });
  });

  it("loses a story whose first checkpoint was never written, leaving an orphan index entry", async () => {
    class FailingSaver extends MemorySaver {
      override put(): never {
        throw new Error("disk full");
      }
    }
    const saver = new FailingSaver();
    const first = service({ saver });
    const { id } = await first.stories.start("Pip", "5-8");
    expect((await settled(first.stories, id)).status).toBe("error");

    const restarted = service({ saver });
    await expect(restarted.stories.view(id)).rejects.toBeInstanceOf(StoryNotFoundError);
    expect(await restarted.stories.list()).toEqual([]); // silently skipped…
    expect((await new StoryIndex(dir, join(dir, "audio")).list()).map((e) => e.id)).toEqual([id]); // …but still indexed
  });
});
