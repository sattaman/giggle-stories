// Runs stories through the LangGraph graph in the background and answers
// "what does the child see now?". One run at a time per story.

import { randomUUID } from "node:crypto";
import type { Logger, ProgressSink, StoryDeps, StoryGraph } from "@storytime/app";
import type { AgeBand, ReplyBody, StoryStage, StorySummary, StoryView } from "@storytime/domain";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import type { StoryIndex } from "./story-index.ts";
import { PersistedStory, buildView, idleProgress, type LiveProgress } from "./view.ts";

export class StoryConflictError extends Error {}

function firstInterruptValue(tasks: readonly { readonly interrupts: readonly { readonly value?: unknown }[] }[]): unknown {
  for (const task of tasks) {
    const first = task.interrupts[0];
    if (first !== undefined) return first.value;
  }
  return undefined;
}
export class StoryNotFoundError extends Error {}

interface MutableProgress {
  busy: boolean;
  stage: StoryStage | null;
  message: string | null;
  error: string | null;
  performed: Map<number, { audioUrl: string; durationMs: number }>;
}

export interface StoryService {
  start(idea: string, ageBand: AgeBand): Promise<StoryView>;
  reply(id: string, body: ReplyBody): Promise<StoryView>;
  view(id: string): Promise<StoryView>;
  list(): Promise<StorySummary[]>;
}

export class GraphStoryService implements StoryService, ProgressSink {
  private readonly live = new Map<string, MutableProgress>();
  private readonly deps: StoryDeps;

  constructor(
    private readonly graph: StoryGraph,
    deps: Omit<StoryDeps, "progress">,
    private readonly log: Logger,
    private readonly index: StoryIndex,
  ) {
    this.deps = { ...deps, progress: this };
  }

  // ── ProgressSink ──
  stage(storyId: string, stage: StoryStage, message: string): void {
    const progress = this.progressFor(storyId);
    progress.stage = stage;
    progress.message = message;
  }

  segmentPerformed(storyId: string, segment: { index: number; audioUrl: string; durationMs: number }): void {
    this.progressFor(storyId).performed.set(segment.index, { audioUrl: segment.audioUrl, durationMs: segment.durationMs });
  }

  // ── StoryService ──
  async start(idea: string, ageBand: AgeBand): Promise<StoryView> {
    const id = `story_${randomUUID().replaceAll("-", "")}`;
    this.log.info({ storyId: id, ageBand }, "story started");
    await this.index.add({ id, createdAt: new Date().toISOString(), ageBand });
    this.run(id, { storyId: id, idea, ageBand });
    return this.view(id);
  }

  async reply(id: string, body: ReplyBody): Promise<StoryView> {
    const current = await this.view(id);
    if (current.status !== "waiting" || current.pending === null) throw new StoryConflictError("Story isn't waiting for a reply");
    if (body.kind === "answer" && current.pending.kind !== "clarification") throw new StoryConflictError("Expected an outline decision");
    if (body.kind === "outline" && current.pending.kind !== "outline_review") throw new StoryConflictError("Expected an answer");

    const resume =
      body.kind === "answer" ? body.text : body.approved ? { approved: true } : { approved: false, feedback: body.feedback };
    this.run(id, { resume });
    return this.view(id);
  }

  async view(id: string): Promise<StoryView> {
    const snapshot = await this.graph.getState({ configurable: { thread_id: id } });
    const progress: LiveProgress = this.live.get(id) ?? idleProgress;
    // Checkpoint values are untyped JSON: validate before use.
    const values = z.record(z.string(), z.unknown()).parse(snapshot.values);
    if (Object.keys(values).length === 0 && !this.live.has(id)) throw new StoryNotFoundError(id);

    const pending = firstInterruptValue(snapshot.tasks);
    return buildView({ id, state: PersistedStory.parse(values), pending, progress });
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

  // ── internals ──
  private progressFor(id: string): MutableProgress {
    let progress = this.live.get(id);
    if (progress === undefined) {
      progress = { busy: false, stage: null, message: null, error: null, performed: new Map() };
      this.live.set(id, progress);
    }
    return progress;
  }

  private run(id: string, input: { storyId: string; idea: string; ageBand: AgeBand } | { resume: unknown }): void {
    const progress = this.progressFor(id);
    if (progress.busy) throw new StoryConflictError("Story is already working");
    progress.busy = true;
    progress.error = null;
    progress.stage = "understanding";
    progress.message = "Thinking…";
    const started = performance.now();

    this.graph
      .invoke("resume" in input ? new Command({ resume: input.resume }) : input, {
        configurable: { thread_id: id },
        context: { deps: this.deps },
        metadata: { thread_id: id }, // groups the whole story as one LangSmith thread
        recursionLimit: 60,
        runName: "story",
      })
      .then(() => {
        this.log.info({ storyId: id, ms: Math.round(performance.now() - started) }, "story step finished");
      })
      .catch((error: unknown) => {
        this.log.error({ storyId: id, error: error instanceof Error ? error.stack : String(error) }, "story step failed");
        progress.error = "Oops, the story machine got in a muddle. Let's try again!";
      })
      .finally(() => {
        progress.busy = false;
        progress.stage = null;
        progress.message = null;
      });
  }
}
