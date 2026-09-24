// Gemini adapters: TTS (SpeechSynthesizer), Voice Design (VoiceDesigner) and
// transcription (Transcriber), via the Interactions API in @google/genai.

import { VoiceRejectedError, type Logger, type SpeechSynthesizer, type Transcriber, type VoiceDesigner } from "@storytime/app";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { SAMPLE_RATE, durationMs, toPcm, toWav } from "./wav.ts";

export const TTS_MODEL = "gemini-3.8-flash-tts";
export const TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

const AudioResult = z.object({ output_audio: z.object({ data: z.string().min(1) }) });
const TextResult = z.object({ output_text: z.string() });
const CreatedVoice = z.object({ id: z.string().min(1) });
const ApiError = z.object({ status: z.number(), message: z.string().optional() });

/** Ready-made voices used when a designed voice can't be created. */
const CATALOG: Record<"female" | "male" | "neutral", readonly string[]> = {
  female: ["Leda", "Aoede", "Zephyr", "Kore", "Laomedeia"],
  male: ["Puck", "Fenrir", "Orus", "Charon", "Enceladus"],
  neutral: ["Zephyr", "Puck", "Aoede", "Fenrir"],
};

export function createGemini(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

function apiError(error: unknown): { status: number; message: string } | undefined {
  const parsed = ApiError.safeParse(error);
  return parsed.success ? { status: parsed.data.status, message: parsed.data.message ?? "" } : undefined;
}

/** Retries 429/5xx, honouring the server's "retry in Ns" hint. Daily quotas aren't retried. */
async function withRetry<T>(what: string, log: Logger, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const api = apiError(error);
      const retryable = api !== undefined && (api.status === 429 || api.status >= 500) && !api.message.includes("per day");
      if (!retryable || attempt >= 5) throw error;
      const hinted = /retry in (\d+(?:\.\d+)?)s/i.exec(api.message)?.[1];
      const waitMs = Math.min(20_000, hinted === undefined ? 1000 * 2 ** attempt : Number(hinted) * 1000 + 250);
      log.warn({ what, attempt, status: api.status, waitMs }, "gemini retry");
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export class GeminiSpeech implements SpeechSynthesizer {
  constructor(
    private readonly ai: GoogleGenAI,
    private readonly log: Logger,
  ) {}

  async synthesize(request: { readonly text: string; readonly voiceId: string; readonly style: string }): Promise<{
    readonly wav: Uint8Array;
    readonly durationMs: number;
  }> {
    const annotations = request.style.trim() === "" ? [] : [{ type: "speech_metadata" as const, style: request.style }];
    const interaction = await withRetry("tts", this.log, () =>
      this.ai.interactions.create({
        model: TTS_MODEL,
        input: [{ type: "user_input", content: [{ type: "text", text: request.text, annotations }] }],
        response_format: { type: "audio", mime_type: "audio/l16", sample_rate: SAMPLE_RATE },
        generation_config: { speech_config: [{ voice: request.voiceId }] },
      }),
    );
    const pcm = toPcm(Buffer.from(AudioResult.parse(interaction).output_audio.data, "base64"));
    return { wav: toWav(pcm), durationMs: durationMs(pcm) };
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
  }): Promise<{ readonly voiceId: string }> {
    try {
      const created = await withRetry("voice_design", this.log, () =>
        this.ai.voices.create({
          store: true,
          voice: {
            type: "prompted",
            model: TTS_MODEL,
            display_name: `storytime-${request.name}`.slice(0, 60),
            gender: request.gender,
            language_code: "en-GB",
            prompted: { input: request.description },
          },
        }),
      );
      return { voiceId: CreatedVoice.parse(created).id };
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
      this.ai.interactions.create({
        model: TRANSCRIBE_MODEL,
        input: [{ type: "audio", data: Buffer.from(audio.bytes).toString("base64"), mime_type: audio.mimeType }],
        generation_config: { transcription_config: { language_codes: ["en"], mode: "smart" } },
      }),
    );
    return TextResult.parse(interaction).output_text.trim();
  }
}
