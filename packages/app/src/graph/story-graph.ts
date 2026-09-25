// The story workflow as a LangGraph state machine.
//
//   START → understand ─(question?)→ askQuestion ⏸ ─→ understand   (max 2 rounds)
//                └─(ready)→ castCharacters ─┬→ designVoices ────────────────┐
//                                          └→ planOutline → draftPage ─────┴→ reviewOutline ⏸
//   reviewOutline ─(changes)→ reviseOutline → recast → redraftPage → reviewOutline
//                 └─(yes!)→ performPage → END
//
// Page 1 is drafted while voices are designed (both slow), so after "Yes!" the child
// only waits for the first line of audio.
//
// Rules (docs/research/langgraph-js.md): nodes with side effects (LLM, TTS, voice
// design) are never the ones that interrupt — a resumed node re-runs from the top.

import {
  AgeBand,
  Character,
  DEFAULT_AGE_BAND,
  MAX_CLARIFICATIONS,
  Outline,
  PageScript,
  PerformedSegment,
  StoryBrief,
  childVoiceCues,
  type CharacterProfile,
  type Pending,
} from "@storytime/domain";
import {
  Command,
  END,
  START,
  StateGraph,
  StateSchema,
  interrupt,
  type BaseCheckpointSaver,
  type GraphNode,
} from "@langchain/langgraph";
import { z } from "zod";
import { mapWithConcurrency } from "../concurrency.ts";
import { VoiceRejectedError, type StoryDeps } from "../ports.ts";
import { StoryWriter } from "../writer/story-writer.ts";

const QuestionAndAnswer = z.object({ question: z.string(), answer: z.string() });

export const StoryState = new StateSchema({
  storyId: z.string(),
  idea: z.string(),
  ageBand: AgeBand.default(DEFAULT_AGE_BAND),
  answers: z.array(QuestionAndAnswer).default([]),
  brief: StoryBrief.optional(),
  pendingQuestion: z.string().optional(),
  pendingQuestionAudioUrl: z.string().nullable().optional(),
  cast: z.array(Character).default([]),
  outline: Outline.optional(),
  outlineFeedback: z.string().optional(),
  script: PageScript.optional(),
  performance: z.array(PerformedSegment).default([]),
});
export type StoryStateValue = typeof StoryState.State;

export const StoryContext = z.object({ deps: z.custom<StoryDeps>() });
type Ctx = z.infer<typeof StoryContext>;
type Node = GraphNode<typeof StoryState, Ctx>;

export type ClarificationAnswer = string;
export type OutlineDecision = { readonly approved: true } | { readonly approved: false; readonly feedback: string };

const SEGMENT_CONCURRENCY = 3;

function depsOf(config: { readonly context?: Ctx | undefined }): StoryDeps {
  const deps = config.context?.deps;
  if (deps === undefined) throw new Error("Story graph invoked without context.deps");
  return deps;
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Story state is missing ${what}`);
  return value;
}

// ── Nodes ────────────────────────────────────────────────────────────────────

const understand: Node = async (state, config) => {
  const deps = depsOf(config);
  const writer = new StoryWriter(deps.model, state.ageBand);
  deps.progress.stage(state.storyId, "understanding", "Thinking about your idea…");

  const brief = await writer.extractBrief(state.idea, state.answers);
  if (state.answers.length >= MAX_CLARIFICATIONS) return { brief, pendingQuestion: undefined };

  const decision = await writer.decide(brief, state.answers);
  deps.log.info({ storyId: state.storyId, decision: decision.decision, reason: decision.reason }, "clarification decision");
  if (decision.decision === "ready" || decision.question.trim() === "") return { brief, pendingQuestion: undefined };

  // Voice the question before pausing (side effects never live in interrupt nodes).
  let audioUrl: string | null = null;
  try {
    const speech = await deps.speech.synthesize({
      text: decision.question,
      voiceId: deps.narratorVoiceId,
      style: "warm, curious, talking to a child",
    });
    audioUrl = await deps.audio.save(state.storyId, `question-${String(state.answers.length + 1)}`, speech.wav);
  } catch (error: unknown) {
    deps.log.warn({ storyId: state.storyId, error: String(error) }, "question audio failed; continuing with text");
  }
  return { brief, pendingQuestion: decision.question, pendingQuestionAudioUrl: audioUrl };
};

const askQuestion: Node = (state) => {
  const question = required(state.pendingQuestion, "pendingQuestion");
  const payload: Pending = {
    kind: "clarification",
    question,
    questionAudioUrl: state.pendingQuestionAudioUrl ?? null,
    round: state.answers.length + 1,
  };
  const answer = interrupt<Pending, ClarificationAnswer>(payload);
  return new Command({
    update: {
      answers: [...state.answers, { question, answer }],
      pendingQuestion: undefined,
      pendingQuestionAudioUrl: undefined,
    },
    goto: "understand",
  });
};

const castCharacters: Node = async (state, config) => {
  const deps = depsOf(config);
  deps.progress.stage(state.storyId, "casting", "Meeting your characters…");
  const profiles = await new StoryWriter(deps.model, state.ageBand).cast(required(state.brief, "brief"));
  return { cast: profiles.map((profile) => ({ ...profile })) };
};

const designVoices: Node = async (state, config) => {
  const deps = depsOf(config);
  const writer = new StoryWriter(deps.model, state.ageBand);
  deps.progress.stage(state.storyId, "casting", "Giving everyone a voice…");
  const cast = await Promise.all(
    state.cast.map((character, index) => withVoice(deps, writer, state.storyId, character, index, "")),
  );
  return { cast };
};

/** Designs (or falls back to) a voice for a character and stores a short sample clip. */
async function withVoice(
  deps: StoryDeps,
  writer: StoryWriter,
  storyId: string,
  character: CharacterProfile,
  index: number,
  sampleSuffix: string,
): Promise<Character> {
  const { preview, ...voice } = await voiceFor(deps, writer, character, index);
  let sampleUrl: string | null = null;
  try {
    // Prefer the free preview from voice design; otherwise say hello in character (1 TTS call).
    const wav =
      preview ??
      (
        await deps.speech.synthesize({
          text: character.catchphrase ?? `Hello! I'm ${character.name}.`,
          voiceId: voice.voiceId,
          style: "introducing myself, in character",
        })
      ).wav;
    sampleUrl = await deps.audio.save(storyId, `voice-${character.id}${sampleSuffix}`, wav);
  } catch (error: unknown) {
    deps.log.warn({ storyId, character: character.id, error: String(error) }, "voice sample failed");
  }
  return { ...character, voice: { ...voice, sampleUrl } };
}

/** Designed voice → rewritten description → catalogue voice. The child never sees a failure. */
async function voiceFor(
  deps: StoryDeps,
  writer: StoryWriter,
  character: CharacterProfile,
  index: number,
): Promise<{ voiceId: string; source: "designed" | "catalog"; preview: Uint8Array | undefined }> {
  try {
    let description = character.voiceDescription;
    let mayRewrite = true;
    if (childVoiceCues(description).length > 0) {
      description = await writer.rewriteVoiceDescription(character);
      mayRewrite = false;
    }
    for (;;) {
      try {
        const { voiceId, preview } = await deps.voices.design({ name: character.name, gender: character.gender, description });
        return { voiceId, source: "designed", preview };
      } catch (error: unknown) {
        if (!(error instanceof VoiceRejectedError) || !mayRewrite) throw error;
        deps.log.warn({ character: character.id, description }, "voice description rejected; rewriting");
        description = await writer.rewriteVoiceDescription({ ...character, voiceDescription: description });
        mayRewrite = false;
      }
    }
  } catch (error: unknown) {
    deps.log.warn({ character: character.id, error: String(error) }, "voice design failed; using catalogue voice");
    return { voiceId: deps.voices.fallback(character.gender, index), source: "catalog", preview: undefined };
  }
}

const planOutline: Node = async (state, config) => {
  const deps = depsOf(config);
  deps.progress.stage(state.storyId, "outlining", "Planning your story…");
  const result = await new StoryWriter(deps.model, state.ageBand).outline(required(state.brief, "brief"), state.cast);
  return { outline: result };
};

const reviewOutline: Node = (state) => {
  const decision = interrupt<Pending, OutlineDecision>({ kind: "outline_review", outline: required(state.outline, "outline") });
  return decision.approved
    ? new Command({ update: { outlineFeedback: undefined }, goto: "performPage" })
    : new Command({ update: { outlineFeedback: decision.feedback }, goto: "reviseOutline" });
};

const reviseOutline: Node = async (state, config) => {
  const deps = depsOf(config);
  const writer = new StoryWriter(deps.model, state.ageBand);
  deps.progress.stage(state.storyId, "outlining", "Changing the plan…");
  const feedback = required(state.outlineFeedback, "outlineFeedback");
  // The change is part of the child's brief from now on (e.g. "Rolo is a girl").
  const answers = [...state.answers, { question: "Changes the child asked for", answer: feedback }];
  const brief = await writer.extractBrief(state.idea, answers);
  const revised = await writer.reviseOutline(brief, state.cast, required(state.outline, "outline"), feedback);
  return { answers, brief, outline: revised };
};

/** Applies the change to the cast; only characters whose voice should change get a new one. */
const recast: Node = async (state, config) => {
  const deps = depsOf(config);
  const writer = new StoryWriter(deps.model, state.ageBand);
  deps.progress.stage(state.storyId, "casting", "Updating your characters…");
  const updated = await writer.recast(
    required(state.brief, "brief"),
    state.cast,
    required(state.outlineFeedback, "outlineFeedback"),
  );
  const before = new Map(state.cast.map((c) => [c.id, c]));
  const round = String(state.answers.length);
  const cast = await Promise.all(
    updated.map(async (character, index): Promise<Character> => {
      const old = before.get(character.id);
      const sameVoice =
        old?.voice !== undefined && old.gender === character.gender && old.voiceDescription === character.voiceDescription;
      if (sameVoice) return { ...character, voice: old.voice };
      deps.log.info({ storyId: state.storyId, character: character.id }, "character changed; designing a new voice");
      return withVoice(deps, writer, state.storyId, character, index, `-r${round}`);
    }),
  );
  return { cast };
};

const draftPage: Node = async (state, config) => {
  const deps = depsOf(config);
  deps.progress.stage(state.storyId, "writing", "Getting page one ready…");
  const script = await new StoryWriter(deps.model, state.ageBand).writePage(
    required(state.brief, "brief"),
    state.cast,
    required(state.outline, "outline"),
    1,
  );
  return { script };
};

const performPage: Node = async (state, config) => {
  const deps = depsOf(config);
  const script = required(state.script, "script");
  deps.progress.stage(state.storyId, "performing", "Warming up the voices…");
  const voiceOf = new Map(state.cast.map((c) => [c.id, c.voice?.voiceId]));

  const performed = await mapWithConcurrency(script.segments, SEGMENT_CONCURRENCY, async (segment, index): Promise<PerformedSegment> => {
    const voiceId = segment.speaker === "narrator" ? deps.narratorVoiceId : voiceOf.get(segment.speaker);
    const base = { index, speaker: segment.speaker, text: segment.text, style: segment.style };
    if (voiceId === undefined) return { ...base, audioUrl: null, durationMs: null };
    try {
      const speech = await deps.speech.synthesize({ text: segment.text, voiceId, style: segment.style });
      const audioUrl = await deps.audio.save(state.storyId, `page-${String(script.page)}-${String(index).padStart(2, "0")}`, speech.wav);
      deps.progress.segmentPerformed(state.storyId, { index, audioUrl, durationMs: speech.durationMs });
      return { ...base, audioUrl, durationMs: speech.durationMs };
    } catch (error: unknown) {
      deps.log.error({ storyId: state.storyId, index, error: String(error) }, "segment synthesis failed; skipping line");
      return { ...base, audioUrl: null, durationMs: null };
    }
  });
  return { performance: performed };
};

// ── Wiring ──────────────────────────────────────────────────────────────────

export function buildStoryGraph() {
  return new StateGraph(StoryState, StoryContext)
    .addNode("understand", understand)
    .addNode("askQuestion", askQuestion, { ends: ["understand"] })
    .addNode("castCharacters", castCharacters)
    .addNode("designVoices", designVoices)
    .addNode("planOutline", planOutline)
    .addNode("draftPage", draftPage)
    .addNode("reviewOutline", reviewOutline, { ends: ["performPage", "reviseOutline"] })
    .addNode("reviseOutline", reviseOutline)
    .addNode("recast", recast)
    // Same work as draftPage; a separate node because the join below fires only once.
    .addNode("redraftPage", draftPage)
    .addNode("performPage", performPage)
    .addEdge(START, "understand")
    .addConditionalEdges("understand", (state) => (state.pendingQuestion === undefined ? "castCharacters" : "askQuestion"), [
      "castCharacters",
      "askQuestion",
    ])
    .addEdge("castCharacters", "designVoices")
    .addEdge("castCharacters", "planOutline")
    .addEdge("planOutline", "draftPage")
    .addEdge(["designVoices", "draftPage"], "reviewOutline")
    .addEdge("reviseOutline", "recast")
    .addEdge("recast", "redraftPage")
    .addEdge("redraftPage", "reviewOutline")
    .addEdge("performPage", END);
}

export function compileStoryGraph(checkpointer: BaseCheckpointSaver) {
  return buildStoryGraph().compile({ checkpointer, name: "storytime" });
}
export type StoryGraph = ReturnType<typeof compileStoryGraph>;
