// LangSmith tracing decorators for non-LangChain ports (langsmith-trace skill).
// LangChain/LangGraph runs are traced automatically; these add Gemini calls to the
// same trace tree. API keys and audio bytes are never recorded.

import type { SpeechSynthesizer, Transcriber, VoiceDesigner } from "@storytime/app";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";
import { TRANSCRIBE_MODEL, TTS_MODEL } from "./gemini/gemini.ts";

/** One client for the traceable wrappers below, so their pending batches can be flushed. */
const client = new Client();

/**
 * Sends traces still queued in the background. Call before the process exits (scripts,
 * SIGTERM): LangChain/LangGraph runs via their callbacks, the wrappers below via `client`.
 */
export async function flushTraces(): Promise<void> {
  await awaitAllCallbacks();
  await client.awaitPendingTraceBatches();
}

const gemini = (model: string) => ({ ls_provider: "google", ls_model_name: model });

export function tracedSpeech(inner: SpeechSynthesizer): SpeechSynthesizer {
  return {
    synthesize: traceable((request: Parameters<SpeechSynthesizer["synthesize"]>[0]) => inner.synthesize(request), {
      name: "gemini_tts",
      run_type: "llm",
      client,
      tags: ["gemini", "tts"],
      metadata: gemini(TTS_MODEL), // may fall back to the Lite model when Flash's daily quota runs out
      processInputs: (request) => ({ text: request.text, voice_id: request.voiceId, style: request.style }),
      processOutputs: (out) => ({ duration_ms: out.durationMs, wav_bytes: out.wav.byteLength }),
    }),
  };
}

export function tracedVoices(inner: VoiceDesigner): VoiceDesigner {
  return {
    design: traceable((request: Parameters<VoiceDesigner["design"]>[0]) => inner.design(request), {
      name: "gemini_voice_design",
      run_type: "tool",
      client,
      tags: ["gemini", "voice-design"],
      metadata: gemini(TTS_MODEL),
      processInputs: (request) => ({ name: request.name, gender: request.gender, description: request.description }),
      processOutputs: (out) => ({ voice_id: out.voiceId, has_preview: out.preview !== undefined }),
    }),
    fallback: (gender, index) => inner.fallback(gender, index),
  };
}

export function tracedTranscriber(inner: Transcriber): Transcriber {
  return {
    transcribe: traceable((audio: Parameters<Transcriber["transcribe"]>[0]) => inner.transcribe(audio), {
      name: "gemini_transcribe",
      run_type: "llm",
      client,
      tags: ["gemini", "stt"],
      metadata: gemini(TRANSCRIBE_MODEL),
      processInputs: (audio) => ({ mime_type: audio.mimeType, bytes: audio.bytes.byteLength }),
    }),
  };
}
