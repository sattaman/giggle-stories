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
  task,
  type BaseCheckpointSaver,
  type GraphNode,
} from "@langchain/langgraph";
import { z } from "zod";
import { createLimiter } from "../concurrency.ts";
import type { StoryDeps } from "../ports.ts";
import { StoryWriter } from "../writer/story-writer.ts";
import { designVoice, durableModel, speak, tolerantDurableModel } from "./durable.ts";
import { report } from "./progress.ts";

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

// Optional so hosts that own the run context (the Studio dev server sends only JSON) can
// validate; buildStoryGraph({ defaultDeps }) supplies them there. depsOf checks at runtime.
export const StoryContext = z.object({ deps: z.custom<StoryDeps>().optional() });
type Ctx = z.infer<typeof StoryContext>;
type Node = GraphNode<typeof StoryState, Ctx>;

/** What the child sends back at each pause, validated inside the graph (any caller can resume). */
export const ClarificationAnswer = z.string().trim().min(1);
export type ClarificationAnswer = z.infer<typeof ClarificationAnswer>;
export const OutlineDecision = z.union([
  z.object({ approved: z.literal(true) }),
  z.object({ approved: z.literal(false), feedback: z.string().trim().min(1) }),
]);
export type OutlineDecision = z.infer<typeof OutlineDecision>;

/** Graph-wide node timeout: a hung provider call aborts the node's signal instead of hanging the story. */
export const NODE_IDLE_TIMEOUT_MS = 120_000;

/**
 * Pauses with `payload` until the resume value fits `schema`. An invalid value re-asks the same
 * question (LangGraph matches repeated interrupt() calls in a node by order).
 */
function ask<S extends z.ZodType>(payload: Pending, schema: S): z.infer<S> {
  for (;;) {
    const parsed = schema.safeParse(interrupt(payload));
    if (parsed.success) return parsed.data;
  }
}

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

/** The story writer for a node: every model call is a durable task, cancelled with the node. */
function writerFor(deps: StoryDeps, state: { readonly ageBand: AgeBand }, signal: AbortSignal | undefined): StoryWriter {
  return new StoryWriter(durableModel(deps.model), state.ageBand, signal);
}

/**
 * The writer for voice preparation. Its only model call rewrites a rejected voice description,
 * and a stock voice covers that failing, so its failures are tolerated rather than failing the run.
 */
function voiceWriterFor(deps: StoryDeps, state: { readonly ageBand: AgeBand }, signal: AbortSignal | undefined): StoryWriter {
  return new StoryWriter(tolerantDurableModel(deps.model), state.ageBand, signal);
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
  const writer = writerFor(deps, state, config.signal);
  report(config, { kind: "stage", stage: "understanding", message: "Thinking about your idea…" });

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
  const spoken = await speak(deps, {
    storyId: state.storyId,
    name: `question-${String(state.answers.length + 1)}`,
    text: decision.question,
    voiceId: deps.narratorVoiceId,
    fallbackVoice: narratorFallback(deps),
    style: "warm, curious, talking to a child",
    signal: config.signal,
  });
  if (!spoken.ok) deps.log.warn({ storyId: state.storyId, error: spoken.error }, "question audio failed; continuing with text");
  const audioUrl = spoken.ok ? spoken.audioUrl : null;
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
  const answer = ask(payload, ClarificationAnswer);
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
  report(config, { kind: "stage", stage: "casting", message: "Meeting your characters…" });
  const profiles = await writerFor(deps, state, config.signal).cast(required(state.brief, "brief"));
  return { cast: profiles.map((profile) => ({ ...profile })) };
};

const designVoices: Node = async (state, config) => {
  const deps = depsOf(config);
  const writer = voiceWriterFor(deps, state, config.signal);
  report(config, { kind: "stage", stage: "casting", message: "Giving everyone a voice…" });
  const picks = pickLibraryVoices(deps, state.cast, new Set());
  const cast = await Promise.all(
    state.cast.map((character, index) => prepareVoice(deps, { writer, signal: config.signal, storyId: state.storyId, character, index, sampleSuffix: "", libraryVoice: picks.get(character.id) })),
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

interface VoiceJob {
  readonly writer: StoryWriter;
  readonly signal: AbortSignal | undefined;
  readonly storyId: string;
  readonly character: CharacterProfile;
  readonly index: number;
  /** Appended to clip names so a recast doesn't overwrite the previous voice's clips. */
  readonly sampleSuffix: string;
  readonly libraryVoice: string | undefined;
}

/**
 * One character's voice as a single task. Characters are prepared in parallel and each makes
 * several calls in turn (design, maybe a rewrite, the hello clip); inside this task those calls
 * are numbered per character, so a re-run restores them correctly whatever order they finish in.
 */
const prepareVoice = task("prepareVoice", (deps: StoryDeps, job: VoiceJob) =>
  withVoice(deps, job.writer, job.signal, job.storyId, job.character, job.index, job.sampleSuffix, job.libraryVoice),
);

/** Library voice if given, else a designed (or fallback) voice; plus a short hello clip. */
async function withVoice(
  deps: StoryDeps,
  writer: StoryWriter,
  signal: AbortSignal | undefined,
  storyId: string,
  character: CharacterProfile,
  index: number,
  sampleSuffix: string,
  libraryVoice: string | undefined,
): Promise<Character> {
  const clipName = `voice-${character.id}${sampleSuffix}`;
  const { previewUrl, ...voice } =
    libraryVoice === undefined
      ? await voiceFor(deps, writer, signal, storyId, character, index, `${clipName}-preview`)
      : { voiceId: libraryVoice, source: "library" as const, previewUrl: null };
  // The character says hello in their own voice (1 TTS call); the design preview is the backup.
  const hello = await speak(deps, {
    storyId,
    name: clipName,
    text: character.hello,
    voiceId: voice.voiceId,
    fallbackVoice: deps.voices.fallback(character.gender, index),
    style: "saying hello to a new friend, in character",
    signal,
  });
  if (!hello.ok) deps.log.warn({ storyId, character: character.id, error: hello.error }, "hello line failed; using preview");
  return { ...character, voice: { ...voice, sampleUrl: hello.ok ? hello.audioUrl : previewUrl } };
}

/**
 * Voice for a character, most personal first:
 *   designed (description cleaned of blocked wording) → designed from an LLM rewrite
 *   → stock cartoon voice (pre-approved) → catalogue voice. The child never sees a failure.
 */
async function voiceFor(
  deps: StoryDeps,
  writer: StoryWriter,
  signal: AbortSignal | undefined,
  storyId: string,
  character: CharacterProfile,
  index: number,
  previewName: string,
): Promise<{ voiceId: string; source: "library" | "designed" | "catalog"; previewUrl: string | null }> {
  const attempts: string[] = [];
  try {
    let description = sanitizeVoiceDescription(character.voiceDescription);
    if (description.length < 20) description = await writer.rewriteVoiceDescription(character);
    let mayRewrite = true;
    for (;;) {
      attempts.push(description);
      const designed = await designVoice(deps, { storyId, name: character.name, gender: character.gender, description, previewName, signal });
      if (designed.ok) return { voiceId: designed.voiceId, source: "designed", previewUrl: designed.previewUrl };
      if (!designed.rejected || !mayRewrite) throw new Error(designed.error);
      deps.log.warn({ character: character.id, description, cues: childVoiceCues(description) }, "voice description rejected; rewriting");
      description = await writer.rewriteVoiceDescription({ ...character, voiceDescription: description });
      mayRewrite = false;
    }
  } catch (error: unknown) {
    const stock = deps.stockVoices[character.gender];
    deps.log.warn(
      { character: character.id, attempts, error: String(error), fallback: stock === undefined ? "catalog" : "stock" },
      "voice design failed; using fallback voice",
    );
    if (stock !== undefined) return { voiceId: stock, source: "designed", previewUrl: null };
    return { voiceId: deps.voices.fallback(character.gender, index), source: "catalog", previewUrl: null };
  }
}

const planOutline: Node = async (state, config) => {
  const deps = depsOf(config);
  report(config, { kind: "stage", stage: "outlining", message: "Planning your story…" });
  const result = await writerFor(deps, state, config.signal).outline(required(state.brief, "brief"), state.cast);
  return { outline: result };
};

const reviewOutline: Node = (state) => {
  const decision = ask({ kind: "outline_review", outline: required(state.outline, "outline") }, OutlineDecision);
  return decision.approved
    ? new Command({ update: { outlineFeedback: undefined }, goto: "performPage" })
    : new Command({ update: { outlineFeedback: decision.feedback }, goto: "reviseOutline" });
};

const reviseOutline: Node = async (state, config) => {
  const deps = depsOf(config);
  const writer = writerFor(deps, state, config.signal);
  report(config, { kind: "stage", stage: "outlining", message: "Changing the plan…" });
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
  const writer = writerFor(deps, state, config.signal);
  report(config, { kind: "stage", stage: "casting", message: "Updating your characters…" });
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
  const voiceWriter = voiceWriterFor(deps, state, config.signal);
  const cast = await Promise.all(
    updated.map(async (character, index): Promise<Character> => {
      const oldVoice = before.get(character.id)?.voice;
      if (keeps(character) && oldVoice !== undefined) return { ...character, voice: oldVoice };
      deps.log.info({ storyId: state.storyId, character: character.id }, "character changed; new voice");
      return prepareVoice(deps, {
        writer: voiceWriter,
        signal: config.signal,
        storyId: state.storyId,
        character,
        index,
        sampleSuffix: `-r${round}`,
        libraryVoice: picks.get(character.id),
      });
    }),
  );
  return { cast };
};

const draftPage: Node = async (state, config) => {
  const deps = depsOf(config);
  report(config, { kind: "stage", stage: "writing", message: "Getting page one ready…" });
  const script = await writerFor(deps, state, config.signal).writePage(
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
  report(config, { kind: "stage", stage: "performing", message: "Warming up the voices…" });
  const voiceOf = new Map(state.cast.map((c) => [c.id, c.voice?.voiceId]));
  const fallbackOf = new Map(state.cast.map((c, index) => [c.id, deps.voices.fallback(c.gender, index)]));

  // Every line's task is started now, in script order (tasks are matched by call order on a
  // re-run); the limiter inside the task keeps at most SEGMENT_CONCURRENCY in flight.
  const limit = createLimiter(SEGMENT_CONCURRENCY);
  const performed = await Promise.all(
    script.segments.map(async (segment, index): Promise<PerformedSegment> => {
      const voiceId = segment.speaker === "narrator" ? deps.narratorVoiceId : voiceOf.get(segment.speaker);
      const base = { index, speaker: segment.speaker, text: segment.text, style: segment.style };
      if (voiceId === undefined) return { ...base, audioUrl: null, durationMs: null };
      const spoken = await speak(
          { ...deps, limit },
          {
            storyId: state.storyId,
            name: `page-${String(script.page)}-${String(index).padStart(2, "0")}`,
            text: segment.text,
            voiceId,
            fallbackVoice: segment.speaker === "narrator" ? narratorFallback(deps) : (fallbackOf.get(segment.speaker) ?? "Puck"),
            style: segment.style,
            signal: config.signal,
          },
        );
      if (!spoken.ok) {
        deps.log.error({ storyId: state.storyId, index, error: spoken.error }, "segment synthesis failed; skipping line");
        return { ...base, audioUrl: null, durationMs: null };
      }
      report(config, { kind: "segment", index, audioUrl: spoken.audioUrl, durationMs: spoken.durationMs });
      return { ...base, audioUrl: spoken.audioUrl, durationMs: spoken.durationMs };
    }),
  );
  return { performance: performed };
};

// ── Wiring ──────────────────────────────────────────────────────────────────

export interface BuildOptions {
  /** Used when a run's context has no deps, e.g. the Studio dev server. Never set in production. */
  readonly defaultDeps?: StoryDeps;
  /** Node idle timeout; tests shorten it. */
  readonly idleTimeoutMs?: number;
}

export function buildStoryGraph(options: BuildOptions = {}) {
  const { defaultDeps } = options;
  const node = (fn: Node): Node =>
    defaultDeps === undefined ? fn : (state, config) => fn(state, { ...config, context: { deps: config.context?.deps ?? defaultDeps } });
  return new StateGraph(StoryState, StoryContext)
    .addNode("understand", node(understand))
    .addNode("askQuestion", node(askQuestion), { ends: ["understand"] })
    .addNode("castCharacters", node(castCharacters))
    .addNode("designVoices", node(designVoices))
    .addNode("planOutline", node(planOutline))
    .addNode("draftPage", node(draftPage))
    // Deferred: runs once, after whichever of designVoices / draftPage were scheduled have finished.
    .addNode("reviewOutline", node(reviewOutline), { ends: ["performPage", "reviseOutline"], defer: true })
    .addNode("reviseOutline", node(reviseOutline))
    .addNode("recast", node(recast))
    // The revision path drafts page 1 again under its own node name. Saved stories can be
    // paused at redraftPage, and node names stay stable while they might be (ADR 0002 §5).
    .addNode("redraftPage", node(draftPage))
    .addNode("performPage", node(performPage))
    .addEdge(START, "understand")
    .addConditionalEdges("understand", (state) => (state.pendingQuestion === undefined ? "castCharacters" : "askQuestion"), [
      "castCharacters",
      "askQuestion",
    ])
    .addEdge("castCharacters", "designVoices")
    .addEdge("castCharacters", "planOutline")
    .addEdge("planOutline", "draftPage")
    .addEdge("designVoices", "reviewOutline")
    .addEdge("draftPage", "reviewOutline")
    .addEdge("reviseOutline", "recast")
    .addEdge("recast", "redraftPage")
    .addEdge("redraftPage", "reviewOutline")
    .addEdge("performPage", END)
    .setNodeDefaults({ timeout: { idleTimeout: options.idleTimeoutMs ?? NODE_IDLE_TIMEOUT_MS } });
}

export function compileStoryGraph(checkpointer: BaseCheckpointSaver, options: BuildOptions = {}) {
  return buildStoryGraph(options).compile({ checkpointer, name: "storytime" });
}
export type StoryGraph = ReturnType<typeof compileStoryGraph>;
