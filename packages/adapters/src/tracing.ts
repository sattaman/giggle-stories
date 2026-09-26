// LangSmith tracing decorators for non-LangChain ports (langsmith-trace skill).
// LangChain/LangGraph runs are traced automatically; these add Gemini calls to the
// same trace tree. API keys and audio bytes are never recorded.

import type { Illustrator, SpeechSynthesizer, Transcriber, VoiceDesigner } from "@storytime/app";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
import { Client } from "langsmith";
import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { TRANSCRIBE_MODEL, TTS_MODEL } from "./gemini/gemini.ts";

/**
 * One client for the traceable wrappers below, so their pending batches can be flushed.
 * Created on first use, not at import: the Client reads LANGSMITH_* when constructed, and
 * main.ts loads .env after its imports have run.
 */
let shared: Client | undefined;
function client(): Client {
  shared ??= new Client();
  return shared;
}

/**
 * Sends traces still queued in the background. Call before the process exits (scripts,
 * SIGTERM): LangChain/LangGraph runs via their callbacks, the wrappers below via `client`.
 */
export async function flushTraces(): Promise<void> {
  await awaitAllCallbacks();
  await shared?.awaitPendingTraceBatches();
}

const gemini = (model: string) => ({ ls_provider: "google", ls_model_name: model });

export function tracedSpeech(inner: SpeechSynthesizer): SpeechSynthesizer {
  return {
    synthesize: traceable(
      async (request: Parameters<SpeechSynthesizer["synthesize"]>[0]) => {
        const result = await inner.synthesize(request);
        // Record the model that actually spoke (daily-quota fallback can change it).
        const run = getCurrentRunTree(true);
        if (run !== undefined && result.model !== undefined) run.metadata = { ...run.metadata, ls_model_name: result.model };
        return result;
      },
      {
        name: "gemini_tts",
        run_type: "llm",
        client: client(),
        tags: ["gemini", "tts"],
        metadata: gemini(TTS_MODEL), // replaced by the model actually used, above
        processInputs: (request) => ({ text: request.text, voice_id: request.voiceId, style: request.style }),
        processOutputs: (out) => ({ duration_ms: out.durationMs, wav_bytes: out.wav.byteLength, model: out.model ?? null }),
      },
    ),
  };
}

export function tracedVoices(inner: VoiceDesigner): VoiceDesigner {
  return {
    design: traceable((request: Parameters<VoiceDesigner["design"]>[0]) => inner.design(request), {
      name: "gemini_voice_design",
      run_type: "tool",
      client: client(),
      tags: ["gemini", "voice-design"],
      metadata: gemini(TTS_MODEL),
      processInputs: (request) => ({ name: request.name, gender: request.gender, description: request.description }),
      processOutputs: (out) => ({ voice_id: out.voiceId, has_preview: out.preview !== undefined }),
    }),
    fallback: (gender, index) => inner.fallback(gender, index),
  };
}

export function tracedTranscriber(inner: Transcriber): Transcriber {
  const transcribe = traceable((audio: Parameters<Transcriber["transcribe"]>[0]) => inner.transcribe(audio), {
    name: "gemini_transcribe",
    run_type: "llm",
    client: client(),
    tags: ["gemini", "stt"],
    metadata: gemini(TRANSCRIBE_MODEL),
    processInputs: (audio) => ({ mime_type: audio.mimeType, bytes: audio.bytes.byteLength }),
    });
  return {
    // Transcriptions happen outside the graph; a story's answers join its LangSmith thread
    // (child runs inherit thread_id), so they can be found, and deleted, with the story.
    transcribe: (audio) =>
      audio.storyId === undefined
        ? transcribe(audio)
        : traceable(() => transcribe(audio), { name: "transcription", client: client(), metadata: { thread_id: audio.storyId } })(),
  };
}

export function tracedIllustrator(inner: Illustrator, model: string): Illustrator {
  return {
    draw: traceable((request: Parameters<Illustrator["draw"]>[0]) => inner.draw(request), {
      name: "draw_picture",
      run_type: "llm",
      client: client(),
      tags: ["image"],
      metadata: { ls_provider: "openrouter", ls_model_name: model },
      processInputs: (request) => ({ prompt: request.prompt }),
      processOutputs: (out) => ({ type: out.type, bytes: out.image.byteLength }),
    }),
  };
}
