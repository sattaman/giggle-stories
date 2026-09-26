// Runs stories through the LangGraph graph in the background and answers
// "what does the child see now?". One run at a time per story.
//
// Recovery (ADR 0002): run status is durable (RunStore). A failed run can be carried on
// with retry(); after a restart, recover() resumes runs that were in flight, once.
// shutdown() drains runs at the next step boundary so a planned restart loses nothing.

import { randomUUID } from "node:crypto";
import { StoryProgress, type Logger, type StoryDeps, type StoryGraph } from "@storytime/app";
import type { AgeBand, ReplyBody, StoryStage, StorySummary, StoryView } from "@storytime/domain";
import { Command, RunControl, isGraphDrained } from "@langchain/langgraph";
import { z } from "zod";
import type { RunStore } from "./run-store.ts";
import type { StoryIndex } from "./story-index.ts";
import { PersistedStory, buildView, idleProgress, type LiveProgress } from "./view.ts";

export class StoryConflictError extends Error {}
export class StoryNotFoundError extends Error {}

/** Automatic resumes after restarts before a story is marked failed (the child can still retry). */
const MAX_AUTOMATIC_RESUMES = 1;

function firstInterruptValue(tasks: readonly { readonly interrupts: readonly { readonly value?: unknown }[] }[]): unknown {
  for (const task of tasks) {
    const first = task.interrupts[0];
    if (first !== undefined) return first.value;
  }
  return undefined;
}

interface MutableProgress {
  busy: boolean;
  stage: StoryStage | null;
  message: string | null;
  performed: Map<number, { audioUrl: string; durationMs: number }>;
}

function copyOf(progress: LiveProgress): LiveProgress {
  return { ...progress, performed: new Map(progress.performed) };
}

/** What a run does: start a story, answer a pause, or carry on from the last checkpoint. */
type RunInput =
  | { readonly kind: "start"; readonly storyId: string; readonly idea: string; readonly ageBand: AgeBand }
  | { readonly kind: "resume"; readonly value: unknown }
  | { readonly kind: "continue"; readonly automatic: boolean };

export interface StoryService {
  start(idea: string, ageBand: AgeBand): Promise<StoryView>;
  reply(id: string, body: ReplyBody): Promise<StoryView>;
  /** Carries on a story that stopped part-way (`view.canRetry`). */
  retry(id: string): Promise<StoryView>;
  view(id: string): Promise<StoryView>;
  list(): Promise<StorySummary[]>;
}

export class GraphStoryService implements StoryService {
  private readonly live = new Map<string, MutableProgress>();
  /** Runs in flight: how to drain each one, and when it has settled. */
  private readonly active = new Map<string, { readonly control: RunControl; readonly settled: Promise<void> }>();

  constructor(
    private readonly graph: StoryGraph,
    private readonly deps: StoryDeps,
    private readonly log: Logger,
    private readonly index: StoryIndex,
    private readonly runs: RunStore,
  ) {}

  // ── StoryService ──
  async start(idea: string, ageBand: AgeBand): Promise<StoryView> {
    const id = `story_${randomUUID().replaceAll("-", "")}`;
    this.log.info({ storyId: id, ageBand }, "story started");
    await this.index.add({ id, createdAt: new Date().toISOString(), ageBand });
    this.run(id, { kind: "start", storyId: id, idea, ageBand });
    return this.view(id);
  }

  async reply(id: string, body: ReplyBody): Promise<StoryView> {
    const current = await this.view(id);
    if (current.status !== "waiting" || current.pending === null) throw new StoryConflictError("Story isn't waiting for a reply");
    if (body.kind === "answer" && current.pending.kind !== "clarification") throw new StoryConflictError("Expected an outline decision");
    if (body.kind === "outline" && current.pending.kind !== "outline_review") throw new StoryConflictError("Expected an answer");

    const value =
      body.kind === "answer" ? body.text : body.approved ? { approved: true } : { approved: false, feedback: body.feedback };
    this.run(id, { kind: "resume", value });
    return this.view(id);
  }

  async retry(id: string): Promise<StoryView> {
    if (!(await this.view(id)).canRetry) throw new StoryConflictError("Story can't be carried on");
    this.log.info({ storyId: id }, "story retried");
    this.run(id, { kind: "continue", automatic: false });
    return this.view(id);
  }

  async view(id: string): Promise<StoryView> {
    // Read live progress and run status before the checkpoint. If the run has already finished
    // (busy is false), its final checkpoint is saved, so the read below sees it. Reading them
    // after the await could pair an older checkpoint with "not busy" and look interrupted.
    const progress = copyOf(this.live.get(id) ?? idleProgress);
    const run = this.runs.get(id);
    const snapshot = await this.graph.getState({ configurable: { thread_id: id } });
    // Checkpoint values are untyped JSON: validate before use.
    const values = z.record(z.string(), z.unknown()).parse(snapshot.values);
    if (Object.keys(values).length === 0 && !this.live.has(id) && run === undefined) throw new StoryNotFoundError(id);

    const pending = firstInterruptValue(snapshot.tasks);
    const resumable = snapshot.next.length > 0 && pending === undefined;
    return buildView({ id, state: PersistedStory.parse(values), pending, progress, run, resumable });
  }

  async list(): Promise<StorySummary[]> {
    const summaries: StorySummary[] = [];
    for (const entry of (await this.index.list()).slice(0, 50)) {
      try {
        const view = await this.view(entry.id);
        const segments = view.performance?.segments ?? [];
        summaries.push({
          id: view.id,
          title: view.title,
          idea: view.idea ?? "",
          ageBand: entry.ageBand,
          createdAt: entry.createdAt,
          status: view.status,
          characters: view.characters.map(({ name, emoji, colour }) => ({ name, emoji, colour })),
          voicedLines: segments.filter((segment) => segment.audioUrl !== null).length,
          totalLines: segments.length,
        });
      } catch {
        // Unknown or unreadable story: leave it out.
      }
    }
    return summaries;
  }

  /**
   * Call once at startup. Resumes runs the previous process left in flight; a story that
   * has already been resumed automatically is marked failed instead, so a crash can't loop.
   */
  async recover(): Promise<void> {
    for (const id of this.runs.running()) {
      const snapshot = await this.graph.getState({ configurable: { thread_id: id } });
      const waiting = firstInterruptValue(snapshot.tasks) !== undefined;
      if (snapshot.next.length === 0 || waiting) {
        this.runs.clear(id); // it finished or paused before the process stopped
        continue;
      }
      if ((this.runs.get(id)?.resumes ?? 0) >= MAX_AUTOMATIC_RESUMES) {
        this.log.warn({ storyId: id }, "story interrupted again after an automatic resume; leaving it for the child");
        this.runs.markFailed(id, "interrupted repeatedly");
        continue;
      }
      this.log.info({ storyId: id, next: snapshot.next }, "resuming story after restart");
      this.run(id, { kind: "continue", automatic: true });
    }
  }

  /**
   * Call on SIGTERM. Each run finishes its current step, saves a checkpoint and stops
   * (GraphDrained); it stays "running" in the RunStore, so recover() carries it on at the next
   * start. Resolves when every run has stopped.
   */
  async shutdown(): Promise<void> {
    for (const { control } of this.active.values()) control.requestDrain("server shutting down");
    await Promise.allSettled([...this.active.values()].map((run) => run.settled));
  }

  // ── internals ──

  /** Runs the graph, folding its custom-stream progress events into the live view. */
  private async stream(
    id: string,
    progress: MutableProgress,
    input: Parameters<StoryGraph["stream"]>[0],
    options: Omit<NonNullable<Parameters<StoryGraph["stream"]>[1]>, "streamMode">,
  ): Promise<void> {
    for await (const chunk of await this.graph.stream(input, { ...options, streamMode: "custom" })) {
      const event = StoryProgress.safeParse(chunk);
      if (!event.success) {
        this.log.warn({ storyId: id, issues: event.error.issues }, "ignoring malformed progress event");
        continue;
      }
      switch (event.data.kind) {
        case "stage":
          progress.stage = event.data.stage;
          progress.message = event.data.message;
          break;
        case "segment":
          progress.performed.set(event.data.index, { audioUrl: event.data.audioUrl, durationMs: event.data.durationMs });
          break;
      }
    }
  }
  private progressFor(id: string): MutableProgress {
    let progress = this.live.get(id);
    if (progress === undefined) {
      progress = { busy: false, stage: null, message: null, performed: new Map() };
      this.live.set(id, progress);
    }
    return progress;
  }

  private run(id: string, input: RunInput): void {
    const progress = this.progressFor(id);
    if (progress.busy) throw new StoryConflictError("Story is already working");
    progress.busy = true;
    progress.stage = "understanding";
    progress.message = "Thinking…";
    this.runs.markRunning(id, { automatic: input.kind === "continue" && input.automatic });
    const started = performance.now();

    const graphInput: Parameters<StoryGraph["stream"]>[0] =
      input.kind === "start"
        ? { storyId: input.storyId, idea: input.idea, ageBand: input.ageBand }
        : input.kind === "resume"
          ? new Command({ resume: input.value })
          : null; // carry on from the last checkpoint
    const control = new RunControl();
    const settled = this.stream(id, progress, graphInput, {
      configurable: { thread_id: id },
      context: { deps: this.deps },
      // thread_id groups the whole story as one LangSmith thread; invocation tells its runs apart.
      metadata: { thread_id: id, invocation: input.kind },
      recursionLimit: 60,
      runName: "story",
      // Save each step's checkpoint before the next step starts. With the default "async" it's
      // written in the background, and a crash could lose the last finished step (ADR 0002).
      durability: "sync",
      control,
    })
      .then(() => {
        this.runs.clear(id);
        this.log.info({ storyId: id, ms: Math.round(performance.now() - started) }, "story step finished");
      })
      .catch((error: unknown) => {
        if (isGraphDrained(error)) {
          // Stopped cleanly for a shutdown: not a failure, and not a crash-loop resume either.
          this.runs.markRunning(id, { automatic: false });
          this.log.info({ storyId: id }, "story drained for shutdown; will resume on restart");
          return;
        }
        this.runs.markFailed(id, error instanceof Error ? error.message : String(error));
        this.log.error({ storyId: id, error: error instanceof Error ? error.stack : String(error) }, "story step failed");
      })
      .finally(() => {
        progress.busy = false;
        progress.stage = null;
        progress.message = null;
        this.active.delete(id);
      });
    this.active.set(id, { control, settled });
  }
}
