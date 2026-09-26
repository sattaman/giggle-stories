// Which screen a StoryView asks for. Pure, so it's easy to test and the story
// screen stays a simple switch.

import type { Outline, Performance, StoryView } from "@storytime/domain";

export type StoryScreen =
  | { readonly kind: "working"; readonly message: string }
  | { readonly kind: "clarification"; readonly question: string; readonly audioUrl: string | null; readonly round: number }
  | { readonly kind: "outline"; readonly outline: Outline }
  | { readonly kind: "performance"; readonly performance: Performance }
  | { readonly kind: "error"; readonly message: string; readonly canRetry: boolean };

const STAGE_MESSAGES: Record<NonNullable<StoryView["stage"]>, string> = {
  listening: "Listening carefully…",
  understanding: "Reading your brilliant idea…",
  casting: "Inventing your characters…",
  outlining: "Planning the adventure…",
  writing: "Writing page 1…",
  performing: "Warming up the voices…",
};

export function screenFor(view: StoryView): StoryScreen {
  if (view.status === "error") {
    return { kind: "error", message: view.error ?? "Something went wrong.", canRetry: view.canRetry };
  }
  if ((view.status === "performing" || view.status === "done") && view.performance !== null) {
    return { kind: "performance", performance: view.performance };
  }
  if (view.status === "waiting" && view.pending !== null) {
    switch (view.pending.kind) {
      case "clarification":
        return {
          kind: "clarification",
          question: view.pending.question,
          audioUrl: view.pending.questionAudioUrl,
          round: view.pending.round,
        };
      case "outline_review":
        return { kind: "outline", outline: view.pending.outline };
    }
  }
  return { kind: "working", message: view.message ?? (view.stage === null ? "Getting ready…" : STAGE_MESSAGES[view.stage]) };
}

/** The server is still changing the view on its own, so keep polling. */
export function shouldPoll(view: StoryView | null): boolean {
  return view === null || view.status === "working" || view.status === "performing";
}

const BASE_POLL_MS = 1000;
const MAX_POLL_MS = 10_000;

/** Delay before the next poll: 1s normally, doubling after each consecutive failure. */
export function pollDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return BASE_POLL_MS;
  return Math.min(BASE_POLL_MS * 2 ** consecutiveFailures, MAX_POLL_MS);
}
