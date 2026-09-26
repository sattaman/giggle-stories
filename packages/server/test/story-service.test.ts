// The story runner with the real graph and synthetic dependencies: overlapping and stale
// replies, failures, retries and restarts. See ADR 0002 for the policy.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { compileStoryGraph, type SpeechSynthesizer, type StructuredModel } from "@storytime/app";
import { SyntheticModel, syntheticDeps } from "@storytime/app/testing";
import type { StoryView } from "@storytime/domain";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteRunStore } from "../src/run-store.ts";
import { StoryIndex } from "../src/story-index.ts";
import { GraphStoryService, StoryConflictError, StoryNotFoundError } from "../src/story-service.ts";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "storytime-service-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A model that fails a task (every time, or once), or waits for `release()` before answering it. */
function controllableModel(options: { failOn?: string; failOnce?: boolean; holdOn?: string } = {}) {
  const inner = new SyntheticModel();
  let failures = 0;
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model: StructuredModel = {
    generate: async (request) => {
      if (request.task === options.failOn && (options.failOnce !== true || failures === 0)) {
        failures += 1;
        throw new Error(`provider down during ${request.task}`);
      }
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

/** The server's storage: one SQLite database for checkpoints and run status, as in main.ts. */
function storage(saverFor: (db: Database.Database) => BaseCheckpointSaver = (db) => new SqliteSaver(db)) {
  const db = new Database(":memory:");
  return { db, saver: saverFor(db) };
}

/** A server process over `store`; call it again with the same store to simulate a restart. */
function service(
  options: { model?: StructuredModel; speech?: SpeechSynthesizer; store?: ReturnType<typeof storage> } = {},
) {
  const store = options.store ?? storage();
  const deps = syntheticDeps({
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.speech === undefined ? {} : { speech: options.speech }),
  });
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const stories = new GraphStoryService(
    compileStoryGraph(store.saver),
    deps,
    silent,
    new StoryIndex(dir, join(dir, "audio")),
    new SqliteRunStore(store.db),
  );
  return { stories, store };
}

/** Polls the story's view until `done` says so. */
async function until(stories: GraphStoryService, id: string, done: (view: StoryView) => boolean): Promise<StoryView> {
  for (let i = 0; i < 200; i++) {
    const view = await stories.view(id);
    if (done(view)) return view;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("story never reached the expected state");
}

/** Waits for the background run to settle (not working/performing). */
function settled(stories: GraphStoryService, id: string): Promise<StoryView> {
  return until(stories, id, (view) => view.status !== "working" && view.status !== "performing");
}

/** Waits until a run is stuck on the held write_page call, i.e. mid-run. */
function writing(stories: GraphStoryService, id: string): Promise<StoryView> {
  return until(stories, id, (view) => view.stage === "writing");
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

  it("shows finished lines while the rest of the page is still being performed", async () => {
    let release = (): void => undefined;
    const lastLine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const speech: SpeechSynthesizer = {
      synthesize: async (request) => {
        if (request.text === "<giggle> A brilliant bad plan.") await lastLine;
        return { wav: new Uint8Array([1]), durationMs: 500 };
      },
    };
    const { stories } = service({ speech });
    const id = await toOutlineReview(stories);
    await stories.reply(id, { kind: "outline", approved: true });

    // Progress arrives on the graph's custom stream before the node (and its checkpoint) finishes.
    const partial = await until(stories, id, (view) => (view.performance?.segments.filter((s) => s.audioUrl !== null).length ?? 0) === 3);
    expect(partial).toMatchObject({ status: "performing", performance: { complete: false } });

    release();
    expect(await settled(stories, id)).toMatchObject({ status: "done", performance: { complete: true } });
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

  it("offers Try again after a failure, and carries on from the failed step only", async () => {
    const gate = controllableModel({ failOn: "write_page", failOnce: true });
    const { stories } = service({ model: gate.model });
    const { id } = await stories.start("Pip", "5-8");
    await settled(stories, id);
    await stories.reply(id, { kind: "answer", text: "Moon cheese" });

    const failed = await settled(stories, id);
    expect(failed).toMatchObject({ status: "error", canRetry: true, error: "Oops, the story machine got in a muddle. Let's try again!" });
    await expect(stories.reply(id, { kind: "outline", approved: true })).rejects.toBeInstanceOf(StoryConflictError);

    const before = [...gate.calls];
    await stories.retry(id);
    expect((await settled(stories, id)).pending?.kind).toBe("outline_review");
    // Only the failed step re-ran: casting, voices and the outline were checkpointed.
    expect(gate.calls.slice(before.length)).toEqual(["write_page"]);
  });

  it("rejects Try again when there is nothing to carry on", async () => {
    const { stories } = service();
    const id = await toOutlineReview(stories);
    await expect(stories.retry(id)).rejects.toBeInstanceOf(StoryConflictError);
  });

  it("resumes a story that was mid-run when the server restarted", async () => {
    const store = storage();
    const crashed = controllableModel({ holdOn: "write_page" }); // never released: the process "dies" here
    const first = service({ model: crashed.model, store });
    const { id } = await first.stories.start("Pip", "5-8");
    await settled(first.stories, id);
    await first.stories.reply(id, { kind: "answer", text: "Moon cheese" });
    await writing(first.stories, id);

    const fresh = controllableModel();
    const restarted = service({ model: fresh.model, store });
    expect(await restarted.stories.view(id)).toMatchObject({ status: "error", canRetry: true, characters: [{ name: "Pip" }] });
    await restarted.stories.recover();
    expect((await settled(restarted.stories, id)).pending?.kind).toBe("outline_review");
    expect(fresh.calls).not.toContain("extract_brief"); // nothing before the crash re-ran
  });

  it("resumes automatically only once, then leaves the story for Try again", async () => {
    const store = storage();
    const first = service({ model: controllableModel({ holdOn: "write_page" }).model, store });
    const { id } = await first.stories.start("Pip", "5-8");
    await settled(first.stories, id);
    await first.stories.reply(id, { kind: "answer", text: "Moon cheese" });

    await writing(first.stories, id);

    const second = service({ model: controllableModel({ holdOn: "write_page" }).model, store });
    await second.stories.recover(); // resumes, then "crashes" again at the same step
    await writing(second.stories, id);

    const third = service({ store });
    await third.stories.recover();
    expect(await third.stories.view(id)).toMatchObject({ status: "error", canRetry: true });
    await third.stories.retry(id);
    expect((await settled(third.stories, id)).pending?.kind).toBe("outline_review");
  });

  it("drains a run at the next step on shutdown, and the next server carries it on", async () => {
    const store = storage();
    const gate = controllableModel({ holdOn: "outline" });
    const first = service({ model: gate.model, store });
    const { id } = await first.stories.start("Pip", "5-8");
    await settled(first.stories, id);
    await first.stories.reply(id, { kind: "answer", text: "Moon cheese" });
    await until(first.stories, id, (view) => view.stage === "outlining");

    const stopped = first.stories.shutdown();
    gate.release(); // the current step (voices + outline) finishes; the page isn't started
    await stopped;
    expect(gate.calls).not.toContain("write_page");

    const next = controllableModel();
    const restarted = service({ model: next.model, store });
    await restarted.stories.recover();
    expect((await settled(restarted.stories, id)).pending?.kind).toBe("outline_review");
    expect(next.calls).toEqual(["write_page"]); // carried on from the page, nothing repeated
  });

  it("leaves waiting and finished stories alone on restart", async () => {
    const store = storage();
    const first = service({ store });
    const id = await toOutlineReview(first.stories);
    const restarted = service({ store });
    await restarted.stories.recover();
    expect((await restarted.stories.view(id)).status).toBe("waiting");
  });

  it("shows a story whose first checkpoint was never written as lost, not missing", async () => {
    class FailingSaver extends SqliteSaver {
      override put(): never {
        throw new Error("disk full");
      }
    }
    const store = storage((db) => new FailingSaver(db));
    const first = service({ store });
    const { id } = await first.stories.start("Pip", "5-8");
    expect(await settled(first.stories, id)).toMatchObject({ status: "error", canRetry: false });

    const restarted = service({ store });
    expect(await restarted.stories.view(id)).toMatchObject({ status: "error", error: "This story got lost. Let's make a new one!" });
    expect((await restarted.stories.list()).map((s) => [s.id, s.status])).toEqual([[id, "error"]]);
  });

  it("reports a story nobody has heard of as not found", async () => {
    const { stories } = service();
    await expect(stories.view("story_nope")).rejects.toBeInstanceOf(StoryNotFoundError);
  });
});
