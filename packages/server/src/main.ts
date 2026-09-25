// Composition root: wires real adapters into the story graph and serves /v1.

import { join } from "node:path";
import { compileStoryGraph } from "@storytime/app";
import {
  DEFAULT_MODELS,
  FsAudioStore,
  GeminiSpeech,
  GeminiTranscriber,
  GeminiVoiceDesigner,
  OpenRouterStructuredModel,
  createGemini,
  tracedSpeech,
  tracedTranscriber,
  tracedVoices,
} from "@storytime/adapters";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import Database from "better-sqlite3";
import { mkdir } from "node:fs/promises";
import { pino } from "pino";
import { loadDotEnv, readConfig } from "./config.ts";
import { buildHttp } from "./http.ts";
import type { VoiceArchetype } from "@storytime/domain";
import { Narration, ensureStockVoices, ensureVoiceLibrary } from "./narration.ts";
import { SqliteRunStore } from "./run-store.ts";
import { StoryIndex } from "./story-index.ts";
import { ensureNarratorVoice } from "./narrator.ts";
import { GraphStoryService } from "./story-service.ts";

const overridden = loadDotEnv();
const config = readConfig();
const log = pino(
  config.LOG_PRETTY === "true"
    ? { level: "info", transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
    : { level: "info" },
);
if (overridden.length > 0) log.warn({ keys: overridden }, ".env overrides shell environment");

await mkdir(config.DATA_DIR, { recursive: true });
const gemini = createGemini(config.GEMINI_API_KEY);
const voices = tracedVoices(new GeminiVoiceDesigner(gemini, log));
const speech = tracedSpeech(new GeminiSpeech(gemini, log));
const transcriber = tracedTranscriber(new GeminiTranscriber(gemini, log));
const audio = new FsAudioStore(join(config.DATA_DIR, "audio"), `${config.publicUrl}/v1/audio`);
const model = new OpenRouterStructuredModel(config.OPENROUTER_API_KEY, log, {
  fast: config.STORY_MODEL_FAST ?? DEFAULT_MODELS.fast,
  creative: config.STORY_MODEL_CREATIVE ?? DEFAULT_MODELS.creative,
});

const narratorVoiceId = await ensureNarratorVoice(voices, config.DATA_DIR, log);
const stockVoices = await ensureStockVoices(voices, config.DATA_DIR, log);
const narration = new Narration(speech, audio, narratorVoiceId, log);
// Filled in the background as library voices become ready (designed once, cached).
const voiceLibrary: Partial<Record<VoiceArchetype, string>> = {};
// One SQLite file holds the checkpoints (story content) and run status (ADR 0002).
const db = new Database(join(config.DATA_DIR, "checkpoints.sqlite"));
const graph = compileStoryGraph(new SqliteSaver(db));
const stories = new GraphStoryService(
  graph,
  { model, voices, speech, audio, log, narratorVoiceId, stockVoices, voiceLibrary },
  log,
  new StoryIndex(config.DATA_DIR, join(config.DATA_DIR, "audio")),
  new SqliteRunStore(db),
);

const app = await buildHttp({
  stories,
  transcriber,
  narration: () => narration.view(),
  audioPath: (s, f) => audio.pathFor(s, f),
  logger: log,
});
await app.listen({ port: config.PORT, host: config.HOST });
await stories.recover(); // carries on stories the last process left mid-run
void narration.prepare(); // one-off TTS in the background; cached on disk afterwards
void ensureVoiceLibrary(voices, config.DATA_DIR, log, voiceLibrary);
log.info(
  { url: config.publicUrl, models: model.models, narratorVoiceId, tracing: process.env["LANGSMITH_TRACING"] === "true" },
  "storytime server ready",
);
