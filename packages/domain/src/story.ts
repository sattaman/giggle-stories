// The story domain: what a child's story is made of, independent of any LLM,
// TTS provider, framework or platform. Every schema here is also the runtime
// validator for data crossing a boundary (LLM output, HTTP bodies).

import { z } from "zod";

export const MAX_CLARIFICATIONS = 2;
export const OUTLINE_PAGES = 6;

/** Stable, URL-safe id derived from the character's name, e.g. "sir-reginald". */
export const CharacterId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lower-case-kebab id")
  .max(40);
export type CharacterId = z.infer<typeof CharacterId>;

/** Who the story is for: drives language, length, humour and peril. */
export const AgeBand = z.enum(["0-4", "5-8", "9-12"]);
export type AgeBand = z.infer<typeof AgeBand>;
export const DEFAULT_AGE_BAND: AgeBand = "9-12";

export const NARRATOR = "narrator";
export const SpeakerId = z.union([z.literal(NARRATOR), CharacterId]);
export type SpeakerId = z.infer<typeof SpeakerId>;

// ── The brief: what the child asked for ─────────────────────────────────────

export const CharacterSketch = z.object({
  name: z.string().min(1).max(60).describe("Exactly as the child said it. Never rename."),
  role: z.enum(["hero", "sidekick", "villain", "friend", "grown-up", "creature", "other"]),
  gender: z.enum(["female", "male", "unknown"]).describe('Only what the child said or clearly implied (e.g. "she"). Otherwise "unknown".'),
  details: z.string().max(1500).describe("Everything the child said about this character, in their words."),
});
export type CharacterSketch = z.infer<typeof CharacterSketch>;

export const StoryBrief = z.object({
  premise: z.string().min(1).max(1500).describe("One or two sentences: what the story is about."),
  characters: z.array(CharacterSketch).max(10),
  setting: z.string().max(600).describe("Where it happens, or empty if not given."),
  tone: z.string().max(300).describe("e.g. silly, exciting, spooky-but-fun. Default: funny adventure."),
  childIdeas: z
    .array(z.string().max(600))
    .max(20)
    .describe("Specific ideas the child asked for, verbatim-ish. Every one must appear in the story."),
});
export type StoryBrief = z.infer<typeof StoryBrief>;

// LLM-facing schemas stay flat objects: provider structured-output modes reject
// oneOf/anyOf (Anthropic via OpenRouter, 2026-09-24).
export const ClarificationDecision = z.object({
  decision: z.enum(["ready", "ask"]),
  reason: z.string().max(2000),
  question: z
    .string()
    .max(400)
    .describe('When asking: ONE short, fun question a child can answer out loud. Empty string when "ready".'),
});
export type ClarificationDecision = z.infer<typeof ClarificationDecision>;

// ── The cast ─────────────────────────────────────────────────────────────────

export const CharacterProfile = z.object({
  id: CharacterId,
  name: z.string().min(1).max(60),
  role: CharacterSketch.shape.role,
  emoji: z.string().min(1).max(8).describe("One emoji for the character card."),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("Card colour, hex."),
  personality: z.string().max(600),
  comicTrait: z.string().max(400).describe("The one funny thing about them."),
  catchphrase: z.string().max(200).optional(),
  gender: z.enum(["female", "male", "neutral"]),
  voiceDescription: z
    .string()
    .min(20)
    .max(600)
    .describe("1–2 sentences describing how the voice SOUNDS. Never age, childhood or real people."),
});
export type CharacterProfile = z.infer<typeof CharacterProfile>;

export const VoiceAssignment = z.object({
  voiceId: z.string().min(1),
  source: z.enum(["designed", "catalog"]),
  /** A short "hello, it's me" line in this voice, for the character card. */
  sampleUrl: z.string().nullable(),
});
export type VoiceAssignment = z.infer<typeof VoiceAssignment>;

export const Character = CharacterProfile.extend({ voice: VoiceAssignment.optional() });
export type Character = z.infer<typeof Character>;

export const Cast = z.object({ characters: z.array(CharacterProfile).min(1).max(6) });
export type Cast = z.infer<typeof Cast>;

// ── Outline ──────────────────────────────────────────────────────────────────

export const OutlinePage = z.object({
  page: z.number().int().min(1).max(OUTLINE_PAGES),
  beat: z.string().min(1).max(600).describe("What happens, in one child-friendly sentence."),
  funnyMoment: z.string().max(600),
});
export type OutlinePage = z.infer<typeof OutlinePage>;

export const Outline = z.object({
  // Not "title": LangChain strips that key when converting to JSON Schema (2026-09-24).
  storyTitle: z.string().min(1).max(120).describe("The story's title."),
  pages: z.array(OutlinePage).length(OUTLINE_PAGES),
});
export type Outline = z.infer<typeof Outline>;

// ── Performance script ───────────────────────────────────────────────────────

export const Segment = z.object({
  speaker: SpeakerId,
  text: z
    .string()
    .min(1)
    .max(800)
    .describe("Spoken verbatim. No stage directions. Optional vocal tags like <giggle>, <gasp>, <short pause>."),
  style: z.string().max(200).describe("Short acting note, e.g. 'excited whisper', 'deadpan'."),
});
export type Segment = z.infer<typeof Segment>;

export const PageScript = z.object({
  page: z.number().int().min(1).max(OUTLINE_PAGES),
  segments: z.array(Segment).min(4).max(60),
});
export type PageScript = z.infer<typeof PageScript>;
