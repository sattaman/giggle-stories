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
  sanitizeVoiceDescription,
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

/** Word-overlap similarity: stops the same question being asked twice. */
function similar(a: string, b: string): boolean {
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z']{3,}/g) ?? []);
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.6;
}

/** Built-in voice for the narrator when designed voices can't be used. */
function narratorFallback(deps: StoryDeps): string {
  return deps.voices.fallback("male", 3);
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
  const repeated = state.answers.some((qa) => similar(qa.question, decision.question));
  if (decision.decision === "ready" || decision.question.trim() === "" || repeated) {
    if (repeated) deps.log.info({ storyId: state.storyId, question: decision.question }, "skipping repeated question");
    return { brief, pendingQuestion: undefined };
  }

  // Voice the question before pausing (side effects never live in interrupt nodes).
  let audioUrl: string | null = null;
  try {
    const speech = await deps.speech.synthesize({
      text: decision.question,
      voiceId: deps.narratorVoiceId,
      fallbackVoice: narratorFallback(deps),
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
  const picks = pickLibraryVoices(deps, state.cast, new Set());
  const cast = await Promise.all(
    state.cast.map((character, index) => withVoice(deps, writer, state.storyId, character, index, "", picks.get(character.id))),
  );
  return { cast };
};

/** Library voice per character, never giving two characters the same voice. */
function pickLibraryVoices(
  deps: StoryDeps,
  characters: readonly CharacterProfile[],
  taken: ReadonlySet<string>,
): Map<string, string> {
  const used = new Set(taken);
  const picks = new Map<string, string>();
  for (const character of characters) {
    const voiceId = deps.voiceLibrary[character.voiceArchetype];
    if (voiceId !== undefined && !used.has(voiceId)) {
      used.add(voiceId);
      picks.set(character.id, voiceId);
    }
  }
  return picks;
}

/** Library voice if given, else a designed (or fallback) voice; plus a short hello clip. */
async function withVoice(
  deps: StoryDeps,
  writer: StoryWriter,
  storyId: string,
  character: CharacterProfile,
  index: number,
  sampleSuffix: string,
  libraryVoice: string | undefined,
): Promise<Character> {
  const { preview, ...voice } =
    libraryVoice === undefined
      ? await voiceFor(deps, writer, character, index)
      : { voiceId: libraryVoice, source: "library" as const, preview: undefined };
  let sampleUrl: string | null = null;
  try {
    // The character says hello in their own voice (1 TTS call); the design preview is the backup.
    let wav: Uint8Array | undefined;
    try {
      wav = (
        await deps.speech.synthesize({
          text: character.hello,
          voiceId: voice.voiceId,
          fallbackVoice: deps.voices.fallback(character.gender, index),
          style: "saying hello to a new friend, in character",
        })
      ).wav;
    } catch (error: unknown) {
      deps.log.warn({ storyId, character: character.id, error: String(error) }, "hello line failed; using preview");
      wav = preview;
    }
    if (wav !== undefined) sampleUrl = await deps.audio.save(storyId, `voice-${character.id}${sampleSuffix}`, wav);
  } catch (error: unknown) {
    deps.log.warn({ storyId, character: character.id, error: String(error) }, "voice sample failed");
  }
  return { ...character, voice: { ...voice, sampleUrl } };
}

/**
 * Voice for a character, most personal first:
 *   designed (description cleaned of blocked wording) → designed from an LLM rewrite
 *   → stock cartoon voice (pre-approved) → catalogue voice. The child never sees a failure.
 */
async function voiceFor(
  deps: StoryDeps,
  writer: StoryWriter,
  character: CharacterProfile,
  index: number,
): Promise<{ voiceId: string; source: "library" | "designed" | "catalog"; preview: Uint8Array | undefined }> {
  const attempts: string[] = [];
  try {
    let description = sanitizeVoiceDescription(character.voiceDescription);
    if (description.length < 20) description = await writer.rewriteVoiceDescription(character);
    let mayRewrite = true;
    for (;;) {
      attempts.push(description);
      try {
        const { voiceId, preview } = await deps.voices.design({ name: character.name, gender: character.gender, description });
        return { voiceId, source: "designed", preview };
      } catch (error: unknown) {
        if (!(error instanceof VoiceRejectedError) || !mayRewrite) throw error;
        deps.log.warn(
          { character: character.id, description, cues: childVoiceCues(description) },
          "voice description rejected; rewriting",
        );
        description = await writer.rewriteVoiceDescription({ ...character, voiceDescription: description });
        mayRewrite = false;
      }
    }
  } catch (error: unknown) {
    const stock = deps.stockVoices[character.gender];
    deps.log.warn(
      { character: character.id, attempts, error: String(error), fallback: stock === undefined ? "catalog" : "stock" },
      "voice design failed; using fallback voice",
    );
    if (stock !== undefined) return { voiceId: stock, source: "designed", preview: undefined };
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
  const keeps = (character: CharacterProfile): boolean => {
    const old = before.get(character.id);
    return (
      old?.voice !== undefined &&
      old.gender === character.gender &&
      old.voiceArchetype === character.voiceArchetype &&
      old.voiceDescription === character.voiceDescription
    );
  };
  const keptVoices = new Set(updated.filter(keeps).flatMap((c) => before.get(c.id)?.voice?.voiceId ?? []));
  const picks = pickLibraryVoices(deps, updated.filter((c) => !keeps(c)), keptVoices);
  const cast = await Promise.all(
    updated.map(async (character, index): Promise<Character> => {
      const oldVoice = before.get(character.id)?.voice;
      if (keeps(character) && oldVoice !== undefined) return { ...character, voice: oldVoice };
      deps.log.info({ storyId: state.storyId, character: character.id }, "character changed; new voice");
      return withVoice(deps, writer, state.storyId, character, index, `-r${round}`, picks.get(character.id));
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
  const fallbackOf = new Map(state.cast.map((c, index) => [c.id, deps.voices.fallback(c.gender, index)]));

  const performed = await mapWithConcurrency(script.segments, SEGMENT_CONCURRENCY, async (segment, index): Promise<PerformedSegment> => {
    const voiceId = segment.speaker === "narrator" ? deps.narratorVoiceId : voiceOf.get(segment.speaker);
    const base = { index, speaker: segment.speaker, text: segment.text, style: segment.style };
    if (voiceId === undefined) return { ...base, audioUrl: null, durationMs: null };
    try {
      const fallbackVoice = segment.speaker === "narrator" ? narratorFallback(deps) : (fallbackOf.get(segment.speaker) ?? "Puck");
      const speech = await deps.speech.synthesize({ text: segment.text, voiceId, fallbackVoice, style: segment.style });
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
