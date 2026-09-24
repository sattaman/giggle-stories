// In-memory StoryApi for trying the whole flow without a server (EXPO_PUBLIC_MOCK=1).
// Timers walk each story through the same states the real server produces:
// working stages → one clarification → outline review → a progressive performance.

import { StoryView, type PerformedSegment, type ReplyBody } from "@storytime/domain";
import { ApiError, SILENT_AUDIO_PREFIX, type StoryApi } from "./story-api.ts";
import { MOCK_CHARACTERS, MOCK_OUTLINE, MOCK_QUESTION, MOCK_SEGMENTS, MOCK_TRANSCRIPTS } from "./mock-script.ts";

const STEP_MS = 1500;
const SEGMENT_READY_MS = 1800;
const LATENCY_MS = 250;

interface Step {
  readonly afterMs: number;
  readonly apply: (view: StoryView) => StoryView;
}

export function createMockStoryApi(): StoryApi {
  const stories = new Map<string, StoryView>();
  let nextId = 1;
  let transcriptions = 0;

  function update(id: string, change: (view: StoryView) => StoryView): void {
    const view = stories.get(id);
    if (view !== undefined) stories.set(id, StoryView.parse(change(view)));
  }

  /** Runs the steps one after another; each delay counts from the previous step. */
  function schedule(id: string, steps: readonly Step[]): void {
    const [first, ...rest] = steps;
    if (first === undefined) return;
    setTimeout(() => {
      update(id, first.apply);
      schedule(id, rest);
    }, first.afterMs);
  }

  function snapshot(id: string): StoryView {
    const view = stories.get(id);
    if (view === undefined) throw new ApiError("Story not found", 404);
    // Parsing returns a fresh copy, so callers never share the mock's state.
    return StoryView.parse(view);
  }

  return {
    async transcribe(): Promise<string> {
      await delay(900);
      const text = MOCK_TRANSCRIPTS[transcriptions % MOCK_TRANSCRIPTS.length] ?? "";
      transcriptions += 1;
      return text;
    },

    async start(idea: string): Promise<StoryView> {
      await delay(LATENCY_MS);
      const id = `story_mock${String(nextId)}`;
      nextId += 1;
      stories.set(id, working({ ...emptyView(id), idea }, "understanding", "Reading your brilliant idea…"));
      schedule(id, [
        { afterMs: STEP_MS, apply: (v) => working(v, "understanding", "Thinking of a question…") },
        {
          afterMs: STEP_MS,
          apply: (v) => ({
            ...v,
            status: "waiting",
            stage: null,
            message: null,
            pending: { kind: "clarification", question: MOCK_QUESTION, questionAudioUrl: null, round: 1 },
          }),
        },
      ]);
      return snapshot(id);
    },

    async get(id: string): Promise<StoryView> {
      await delay(LATENCY_MS);
      return snapshot(id);
    },

    async reply(id: string, body: ReplyBody): Promise<StoryView> {
      await delay(LATENCY_MS);
      const current = snapshot(id);
      if (current.status !== "waiting" || current.pending === null) throw new ApiError("Not waiting for a reply", 409);
      if (body.kind === "answer") {
        update(id, (v) => working(v, "casting", "Inventing your characters…"));
        schedule(id, castingSteps());
      } else if (body.approved) {
        update(id, (v) => working(v, "writing", "Writing page 1…"));
        schedule(id, performanceSteps());
      } else {
        update(id, (v) => working(v, "outlining", "Changing the plan…"));
        schedule(id, [
          { afterMs: STEP_MS * 2, apply: (v) => outlineReview(v, "Captain Crumbs and the EXTRA Cheesy Treasure") },
        ]);
      }
      return snapshot(id);
    },
  };
}

function castingSteps(): Step[] {
  return [
    { afterMs: STEP_MS, apply: (v) => ({ ...working(v, "casting", "Giving everyone a voice…"), characters: [...MOCK_CHARACTERS] }) },
    {
      afterMs: STEP_MS * 1.5,
      apply: (v) => ({
        ...working(v, "outlining", "Planning the adventure…"),
        characters: MOCK_CHARACTERS.map((c) => ({ ...c, voice: { voiceId: `mock-${c.id}`, source: "designed", sampleUrl: null } })),
      }),
    },
    { afterMs: STEP_MS, apply: (v) => outlineReview(v, MOCK_OUTLINE.storyTitle) },
  ];
}

function performanceSteps(): Step[] {
  const segments: PerformedSegment[] = MOCK_SEGMENTS.map((segment, index) => ({
    index,
    ...segment,
    audioUrl: null,
    durationMs: estimateDurationMs(segment.text),
  }));
  const steps: Step[] = [
    { afterMs: STEP_MS, apply: (v) => working(v, "performing", "Warming up the voices…") },
    {
      afterMs: STEP_MS,
      apply: (v) => ({
        ...v,
        status: "performing",
        stage: "performing",
        message: "Recording the story…",
        performance: { page: 1, segments, complete: false },
      }),
    },
  ];
  segments.forEach((segment) => {
    steps.push({ afterMs: SEGMENT_READY_MS, apply: (v) => withSegmentAudio(v, segment.index) });
  });
  return steps;
}

function withSegmentAudio(view: StoryView, index: number): StoryView {
  if (view.performance === null) return view;
  const segments = view.performance.segments.map((s) =>
    s.index === index ? { ...s, audioUrl: `${SILENT_AUDIO_PREFIX}${String(index)}` } : s,
  );
  const complete = segments.every((s) => s.audioUrl !== null);
  return {
    ...view,
    status: complete ? "done" : "performing",
    stage: complete ? null : "performing",
    message: complete ? null : view.message,
    performance: { ...view.performance, segments, complete },
  };
}

function outlineReview(view: StoryView, storyTitle: string): StoryView {
  return {
    ...view,
    status: "waiting",
    stage: null,
    message: null,
    title: storyTitle,
    pending: { kind: "outline_review", outline: { ...MOCK_OUTLINE, storyTitle } },
  };
}

function working(view: StoryView, stage: NonNullable<StoryView["stage"]>, message: string): StoryView {
  return { ...view, status: "working", stage, message, pending: null };
}

function emptyView(id: string): StoryView {
  return {
    id,
    status: "working",
    stage: null,
    message: null,
    idea: null,
    pending: null,
    characters: [],
    title: null,
    performance: null,
    error: null,
  };
}

/** Roughly how long a line takes to read aloud. */
function estimateDurationMs(text: string): number {
  return 800 + text.split(/\s+/).length * 330;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
