// LangSmith tracing for the voice spike (langsmith-trace skill: this is a
// non-LangChain app, so every step is wrapped with `traceable`, named, and tagged).
//
// Tracing is a decorator around the Gemini functions: business code stays
// unaware of it. With LANGSMITH_TRACING unset, `traceable` is a transparent no-op.
//
// Rules we enforce here:
// - The GoogleGenAI client is never recorded (it holds the API key).
// - Raw audio bytes are never recorded as inputs/outputs; the finished page is
//   uploaded once as a WAV *attachment*, so it can be played from the trace.

import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";
import { designVoice, synthesize, TTS_MODEL, type DesignVoice, type Synthesize } from "./gemini.js";
import { durationMs } from "./wav.js";

export const langsmith = new Client();

export function tracingEnabled(): boolean {
  return process.env["LANGSMITH_TRACING"] === "true";
}

/** Flush queued runs before the process exits (short-lived scripts drop them otherwise). */
export async function flushTraces(): Promise<void> {
  if (tracingEnabled()) await langsmith.awaitPendingTraceBatches();
}

export const tracedDesignVoice: DesignVoice = traceable(designVoice, {
  name: "design_voice",
  run_type: "tool",
  client: langsmith,
  tags: ["gemini", "voice-design"],
  metadata: { ls_provider: "google", ls_model_name: TTS_MODEL },
  processInputs: ({ args: [, member] }) => ({
    key: member.key,
    display_name: member.displayName,
    gender: member.gender,
    description: member.description,
  }),
  processOutputs: (voice) => ({
    voice_id: voice.id,
    latency_ms: voice.latencyMs,
    has_preview: voice.preview !== undefined,
  }),
});

export const tracedSynthesize: Synthesize = traceable(synthesize, {
  name: "gemini_tts",
  run_type: "llm",
  client: langsmith,
  tags: ["gemini", "tts"],
  metadata: { ls_provider: "google", ls_model_name: TTS_MODEL },
  processInputs: ({ args: [, request] }) => ({
    text: request.text,
    style: request.style ?? null,
    voice_id: request.voiceId,
  }),
  processOutputs: (synthesis) => ({
    audio_ms: durationMs(synthesis.pcm),
    pcm_bytes: synthesis.pcm.length,
    latency_ms: synthesis.latencyMs,
    usage_metadata: {
      input_tokens: synthesis.inputTokens ?? 0,
      output_tokens: synthesis.outputTokens ?? 0,
      total_tokens: (synthesis.inputTokens ?? 0) + (synthesis.outputTokens ?? 0),
    },
  }),
});

interface PublishedPage {
  readonly variant: string;
  readonly path: string;
  readonly wav: Buffer;
}

/** Records the finished page with its WAV attached, so it can be played in LangSmith. */
export const publishPage = traceable(
  (page: PublishedPage) => Promise.resolve({ path: page.path, bytes: page.wav.length }),
  {
    name: "publish_page",
    run_type: "tool",
    client: langsmith,
    tags: ["audio"],
    extractAttachments: (page: PublishedPage) => [
      { [`${page.variant}_page_audio`]: ["audio/wav", page.wav] },
      { variant: page.variant, path: page.path },
    ],
  },
);

export { traceable };
