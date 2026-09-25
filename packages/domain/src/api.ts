// HTTP contract (/v1) shared by the server and every client (web now, mobile later).
// Clients poll GET /v1/stories/:id; the view is the whole truth about a story.

import { z } from "zod";
import { AgeBand, Character, DEFAULT_AGE_BAND, Outline, SpeakerId } from "./story.ts";

export const StoryStage = z.enum([
  "listening", // transcribing the child's audio
  "understanding", // extracting the brief / deciding on a question
  "casting", // creating characters and their voices
  "outlining",
  "writing", // writing the page script
  "performing", // synthesising audio
]);
export type StoryStage = z.infer<typeof StoryStage>;

export const PendingClarification = z.object({
  kind: z.literal("clarification"),
  question: z.string(),
  questionAudioUrl: z.string().nullable(),
  round: z.number().int(),
});

export const PendingOutlineReview = z.object({
  kind: z.literal("outline_review"),
  outline: Outline,
});

export const Pending = z.discriminatedUnion("kind", [PendingClarification, PendingOutlineReview]);
export type Pending = z.infer<typeof Pending>;

export const PerformedSegment = z.object({
  index: z.number().int(),
  speaker: SpeakerId,
  text: z.string(),
  style: z.string(),
  audioUrl: z.string().nullable(),
  durationMs: z.number().int().nullable(),
});
export type PerformedSegment = z.infer<typeof PerformedSegment>;

export const Performance = z.object({
  page: z.number().int(),
  segments: z.array(PerformedSegment),
  complete: z.boolean(),
});
export type Performance = z.infer<typeof Performance>;

export const StoryView = z.object({
  id: z.string(),
  status: z.enum(["working", "waiting", "performing", "done", "error"]),
  stage: StoryStage.nullable(),
  message: z.string().nullable().describe("Friendly progress line for the child, e.g. 'Designing voices…'"),
  idea: z.string().nullable(),
  pending: Pending.nullable(),
  characters: z.array(Character),
  title: z.string().nullable(),
  performance: Performance.nullable(),
  error: z.string().nullable(),
});
export type StoryView = z.infer<typeof StoryView>;

export const StartStoryBody = z.object({
  idea: z.string().min(1).max(2000),
  ageBand: AgeBand.default(DEFAULT_AGE_BAND),
});
export type StartStoryBody = z.input<typeof StartStoryBody>;

const AnswerReply = z.object({ kind: z.literal("answer"), text: z.string().min(1).max(1000) });
const OutlineReply = z.discriminatedUnion("approved", [
  z.object({ kind: z.literal("outline"), approved: z.literal(true) }),
  z.object({ kind: z.literal("outline"), approved: z.literal(false), feedback: z.string().min(1).max(1000) }),
]);
export const ReplyBody = z.union([AnswerReply, OutlineReply]);
export type ReplyBody = z.infer<typeof ReplyBody>;

export const TranscriptionResult = z.object({ text: z.string() });
export type TranscriptionResult = z.infer<typeof TranscriptionResult>;
