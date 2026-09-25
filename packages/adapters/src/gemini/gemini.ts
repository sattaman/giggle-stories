// Gemini adapters: TTS (SpeechSynthesizer), Voice Design (VoiceDesigner) and
// transcription (Transcriber), via the Interactions API in @google/genai.

import { VoiceRejectedError, type Logger, type SpeechSynthesizer, type Transcriber, type VoiceDesigner } from "@storytime/app";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { SAMPLE_RATE, durationMs, toPcm, toWav } from "./wav.ts";

export const TTS_MODEL = "gemini-3.8-flash-tts";
/** Separate daily quota, accepts the same designed voices (verified 2026-09-24). */
export const TTS_FALLBACK_MODEL = "gemini-3.8-flash-lite-tts";
/**
 * Older TTS models, each with its own daily quota. They only take built-in voices and
 * the generateContent API (verified 2026-09-25), so they're the last resort.
 */
export const LEGACY_TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"] as const;

const LegacyAudio = z.object({
  candidates: z
    .array(
      z.object({
        // Occasionally a candidate comes back with no parts (no audio): try the next model.
        content: z
          .object({ parts: z.array(z.object({ inlineData: z.object({ data: z.string().min(1) }).optional() })).optional() })
          .optional(),
      }),
    )
    .min(1),
});

/** Legacy models read tags like <giggle> literally; drop them. */
function withoutVocalTags(text: string): string {
  return text.replace(/<[a-z -]+>/gi, "").replace(/\s{2,}/g, " ").trim();
}
export const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

const AudioResult = z.object({ output_audio: z.object({ data: z.string().min(1) }) });
// No speech in the recording → Gemini omits output_text.
const TextResult = z.object({ output_text: z.string().default("") });

/** Our own retry loop handles rate limits; the SDK's hidden retries made quota errors take ~30s. */
const NO_SDK_RETRIES = { maxRetries: 0 } as const;
const CreatedVoice = z.object({
  id: z.string().min(1),
  sample_audio: z.object({ data: z.string().min(1) }).optional(),
});
const ApiError = z.object({ status: z.number(), message: z.string().optional() });

/** Ready-made voices used when a designed voice can't be created. */
const CATALOG: Record<"female" | "male" | "neutral", readonly string[]> = {
  female: ["Leda", "Aoede", "Kore", "Laomedeia", "Zephyr"],
  male: ["Puck", "Fenrir", "Orus", "Charon", "Enceladus"],
  // Gender-unknown characters: bright, playful voices either way.
  neutral: ["Zephyr", "Puck", "Leda", "Fenrir"],
};

export function createGemini(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

function apiError(error: unknown): { status: number; message: string } | undefined {
  const parsed = ApiError.safeParse(error);
  return parsed.success ? { status: parsed.data.status, message: parsed.data.message ?? "" } : undefined;
}

function isDailyQuota(error: unknown): boolean {
  const api = apiError(error);
  return api?.status === 429 && /per day/i.test(api.message);
}

/** "retry in 1h16m13s" / "retry in 22s" → milliseconds. */
export function retryDelayMs(message: string): number | undefined {
  const match = /retry in ((?:\d+h)?(?:\d+m)?(?:\d+(?:\.\d+)?s)?)/i.exec(message)?.[1];
  if (match === undefined || match === "") return undefined;
  const part = (unit: string): number => Number(new RegExp(`(\\d+(?:\\.\\d+)?)${unit}`).exec(match)?.[1] ?? 0);
  return Math.round((part("h") * 3600 + part("m") * 60 + part("s")) * 1000);
}

/** Retries 429/5xx, honouring the server's "retry in Ns" hint. Daily quotas aren't retried. */
async function withRetry<T>(what: string, log: Logger, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const api = apiError(error);
      const retryable = api !== undefined && (api.status === 429 || api.status >= 500) && !isDailyQuota(error);
      if (!retryable || attempt >= 5) throw error;
      const hinted = retryDelayMs(api.message);
      const waitMs = Math.min(20_000, hinted === undefined ? 1000 * 2 ** attempt : hinted + 250);
      log.warn({ what, attempt, status: api.status, waitMs }, "gemini retry");
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export class GeminiSpeech implements SpeechSynthesizer {
  /** model → time its daily quota resets (ms since epoch). */
  private readonly exhaustedUntil = new Map<string, number>();

  constructor(
    private readonly ai: GoogleGenAI,
    private readonly log: Logger,
    private readonly models: readonly string[] = [TTS_MODEL, TTS_FALLBACK_MODEL],
  ) {}

  async synthesize(request: {
    readonly text: string;
    readonly voiceId: string;
    readonly fallbackVoice: string;
    readonly style: string;
  }): Promise<{
    readonly wav: Uint8Array;
    readonly durationMs: number;
  }> {
    const annotations = request.style.trim() === "" ? [] : [{ type: "speech_metadata" as const, style: request.style }];
    let lastError: unknown = new Error("All TTS models are out of daily quota");
    for (const model of this.models) {
      if ((this.exhaustedUntil.get(model) ?? 0) > Date.now()) continue;
      try {
        const interaction = await withRetry(`tts:${model}`, this.log, () =>
          this.ai.interactions.create(
            {
              model,
              input: [{ type: "user_input", content: [{ type: "text", text: request.text, annotations }] }],
              response_format: { type: "audio", mime_type: "audio/l16", sample_rate: SAMPLE_RATE },
              generation_config: { speech_config: [{ voice: request.voiceId }] },
            },
            NO_SDK_RETRIES,
          ),
        );
        const pcm = toPcm(Buffer.from(AudioResult.parse(interaction).output_audio.data, "base64"));
        return { wav: toWav(pcm), durationMs: durationMs(pcm) };
      } catch (error: unknown) {
        if (!isDailyQuota(error)) throw error;
        const resetMs = retryDelayMs(apiError(error)?.message ?? "") ?? 60 * 60 * 1000;
        this.exhaustedUntil.set(model, Date.now() + resetMs);
        this.log.warn({ model, resetInMinutes: Math.round(resetMs / 60_000) }, "tts daily quota exhausted; trying fallback model");
        lastError = error;
      }
    }
    // Last resort: older models with a built-in voice of the right gender.
    for (const model of LEGACY_TTS_MODELS) {
      if ((this.exhaustedUntil.get(model) ?? 0) > Date.now()) continue;
      try {
        const spoken = withoutVocalTags(request.text);
        const text = request.style.trim() === "" ? spoken : `Say in a ${request.style} way: ${spoken}`;
        const response = await withRetry(`tts:${model}`, this.log, () =>
          this.ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text }] }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: request.fallbackVoice } } },
              httpOptions: { retryOptions: { attempts: 1 } },
            },
          }),
        );
        const data = LegacyAudio.parse(response).candidates[0]?.content?.parts?.find((p) => p.inlineData !== undefined)
          ?.inlineData?.data;
        if (data === undefined) {
          this.log.warn({ model }, "legacy tts returned no audio; trying next model");
          lastError = new Error(`${model} returned no audio`);
          continue;
        }
        const pcm = toPcm(Buffer.from(data, "base64"));
        this.log.warn({ model, voice: request.fallbackVoice }, "tts via legacy model (built-in voice)");
        return { wav: toWav(pcm), durationMs: durationMs(pcm) };
      } catch (error: unknown) {
        if (!isDailyQuota(error)) throw error;
        const resetMs = retryDelayMs(apiError(error)?.message ?? "") ?? 60 * 60 * 1000;
        this.exhaustedUntil.set(model, Date.now() + resetMs);
        this.log.warn({ model, resetInMinutes: Math.round(resetMs / 60_000) }, "tts daily quota exhausted; trying fallback model");
        lastError = error;
      }
    }
    throw lastError;
  }
}

export class GeminiVoiceDesigner implements VoiceDesigner {
  constructor(
    private readonly ai: GoogleGenAI,
    private readonly log: Logger,
  ) {}

  async design(request: {
    readonly name: string;
    readonly gender: "female" | "male" | "neutral";
    readonly description: string;
  }): Promise<{ readonly voiceId: string; readonly preview: Uint8Array | undefined }> {
    try {
      const created = await withRetry("voice_design", this.log, () =>
        this.ai.voices.create(
          {
          store: true,
          voice: {
            type: "prompted",
            model: TTS_MODEL,
            display_name: `storytime-${request.name}`.slice(0, 60),
            gender: request.gender,
            language_code: "en-GB",
            prompted: { input: request.description },
          },
        },
          NO_SDK_RETRIES,
        ),
      );
      const voice = CreatedVoice.parse(created);
      return {
        voiceId: voice.id,
        preview: voice.sample_audio === undefined ? undefined : Buffer.from(voice.sample_audio.data, "base64"),
      };
    } catch (error: unknown) {
      const api = apiError(error);
      if (api?.status === 400 && /safety/i.test(api.message)) throw new VoiceRejectedError("blocked by safety policies");
      throw error;
    }
  }

  fallback(gender: "female" | "male" | "neutral", index: number): string {
    const voices = CATALOG[gender];
    return voices[index % voices.length] ?? "Puck";
  }
}

export class GeminiTranscriber implements Transcriber {
  constructor(
    private readonly ai: GoogleGenAI,
    private readonly log: Logger,
  ) {}

  async transcribe(audio: { readonly bytes: Uint8Array; readonly mimeType: string }): Promise<string> {
    const interaction = await withRetry("transcribe", this.log, () =>
      this.ai.interactions.create(
        {
          model: TRANSCRIBE_MODEL,
          input: [{ type: "audio", data: Buffer.from(audio.bytes).toString("base64"), mime_type: audio.mimeType }],
          generation_config: { transcription_config: { language_codes: ["en"], mode: "smart" } },
        },
        NO_SDK_RETRIES,
      ),
    );
    return TextResult.parse(interaction).output_text.trim();
  }
}
