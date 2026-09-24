// LangSmith tracing decorators for non-LangChain ports (langsmith-trace skill).
// LangChain/LangGraph runs are traced automatically; these add Gemini calls to the
// same trace tree. API keys and audio bytes are never recorded.

import type { SpeechSynthesizer, Transcriber, VoiceDesigner } from "@storytime/app";
import { traceable } from "langsmith/traceable";
import { TRANSCRIBE_MODEL, TTS_MODEL } from "./gemini/gemini.ts";

const gemini = (model: string) => ({ ls_provider: "google", ls_model_name: model });

export function tracedSpeech(inner: SpeechSynthesizer): SpeechSynthesizer {
  return {
    synthesize: traceable((request: Parameters<SpeechSynthesizer["synthesize"]>[0]) => inner.synthesize(request), {
      name: "gemini_tts",
      run_type: "llm",
      tags: ["gemini", "tts"],
      metadata: gemini(TTS_MODEL),
      processOutputs: (out) => ({ duration_ms: out.durationMs, wav_bytes: out.wav.byteLength }),
    }),
  };
}

export function tracedVoices(inner: VoiceDesigner): VoiceDesigner {
  return {
    design: traceable((request: Parameters<VoiceDesigner["design"]>[0]) => inner.design(request), {
      name: "gemini_voice_design",
      run_type: "tool",
      tags: ["gemini", "voice-design"],
      metadata: gemini(TTS_MODEL),
    }),
    fallback: (gender, index) => inner.fallback(gender, index),
  };
}

export function tracedTranscriber(inner: Transcriber): Transcriber {
  return {
    transcribe: traceable((audio: Parameters<Transcriber["transcribe"]>[0]) => inner.transcribe(audio), {
      name: "gemini_transcribe",
      run_type: "llm",
      tags: ["gemini", "stt"],
      metadata: gemini(TRANSCRIBE_MODEL),
      processInputs: (audio) => ({ mime_type: audio.mimeType, bytes: audio.bytes.byteLength }),
    }),
  };
}
