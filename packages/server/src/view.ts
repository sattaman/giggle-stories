// Builds the client-facing StoryView from the graph checkpoint + live progress.
// Pure, so the rules for "what does the child see now" are unit-testable.

import {
  Character,
  Outline,
  PageScript,
  Pending,
  PerformedSegment,
  type StoryStage,
  type StoryView,
} from "@storytime/domain";
import { z } from "zod";

/**
 * Characters saved before `hello` / `voiceArchetype` existed (2026-09-25) get sensible
 * defaults, so older stories still open and replay.
 */
function upgradeCharacter(raw: unknown): unknown {
  const parsed = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!parsed.success) return raw;
  const stored = parsed.data;
  const name = typeof stored["name"] === "string" ? stored["name"] : "";
  const gender = stored["gender"];
  const voiceArchetype = gender === "female" ? "kid-hero-female" : gender === "male" ? "kid-hero-male" : "creature-neutral";
  return { voiceArchetype, hello: `Hello! I'm ${name}.`, ...stored };
}

/** The subset of graph state the view needs, validated (checkpoints are untrusted JSON). */
export const PersistedStory = z.object({
  idea: z.string().optional(),
  cast: z.array(z.preprocess(upgradeCharacter, Character)).default([]),
  outline: Outline.optional(),
  script: PageScript.optional(),
  performance: z.array(PerformedSegment).default([]),
});
export type PersistedStory = z.infer<typeof PersistedStory>;

export interface LiveProgress {
  readonly busy: boolean;
  readonly stage: StoryStage | null;
  readonly message: string | null;
  readonly error: string | null;
  readonly performed: ReadonlyMap<number, { readonly audioUrl: string; readonly durationMs: number }>;
}

export const idleProgress: LiveProgress = { busy: false, stage: null, message: null, error: null, performed: new Map() };

export function buildView(input: {
  readonly id: string;
  readonly state: PersistedStory;
  readonly pending: unknown;
  readonly progress: LiveProgress;
}): StoryView {
  const { id, state, progress } = input;
  const parsedPending = Pending.safeParse(input.pending);
  const pending = !progress.busy && parsedPending.success ? parsedPending.data : null;

  const performance =
    state.script === undefined
      ? null
      : {
          page: state.script.page,
          segments: state.script.segments.map((segment, index) => {
            const done = state.performance[index];
            const live = progress.performed.get(index);
            return {
              index,
              speaker: segment.speaker,
              text: segment.text,
              style: segment.style,
              audioUrl: done?.audioUrl ?? live?.audioUrl ?? null,
              durationMs: done?.durationMs ?? live?.durationMs ?? null,
            };
          }),
          complete: state.performance.length === state.script.segments.length,
        };

  let status: StoryView["status"];
  let error = progress.error;
  if (error !== null) status = "error";
  else if (progress.busy) status = progress.stage === "performing" ? "performing" : "working";
  else if (pending !== null) status = "waiting";
  else if (performance?.complete === true) status = "done";
  else {
    // Idle with nothing to do: the run died (e.g. server restart mid-step).
    status = "error";
    error = "This story got interrupted. Let's make a new one!";
  }

  return {
    id,
    status,
    stage: progress.busy ? progress.stage : null,
    message: progress.busy ? progress.message : null,
    idea: state.idea ?? null,
    pending,
    characters: state.cast,
    title: state.outline?.storyTitle ?? null,
    performance,
    error,
  };
}
