import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { CastMember } from "./cast.js";
import { SAMPLE_RATE, toPcm } from "./wav.js";

export const TTS_MODEL = "gemini-3.8-flash-tts";

// SDK results are validated before use (typescript-setup: runtime boundary policy).
const SynthesisResult = z.object({
  output_audio: z.object({ data: z.string().min(1), mime_type: z.string().optional() }),
  usage: z
    .object({ total_input_tokens: z.number().optional(), total_output_tokens: z.number().optional() })
    .optional(),
});

const CreatedVoice = z.object({
  id: z.string().min(1),
  sample_audio: z.object({ data: z.string(), mime_type: z.string() }).optional(),
});

const VoiceCache = z.record(z.string(), z.object({ id: z.string(), descriptionHash: z.string() }));
type VoiceCache = z.infer<typeof VoiceCache>;

const ErrorWithStatus = z.object({ status: z.number() });

export interface Synthesis {
  readonly pcm: Buffer;
  readonly latencyMs: number;
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
}

export function createClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

async function readCache(path: string): Promise<VoiceCache> {
  try {
    return VoiceCache.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return {};
  }
}

/**
 * Returns a designed `voice_...` id per cast member. Voices are cached by a hash of
 * their description, so editing a description in cast.ts designs a fresh voice
 * (and deletes the stale one — the project limit is 200 stored voices).
 */
export async function ensureVoices(
  ai: GoogleGenAI,
  members: readonly CastMember[],
  outDir: string,
): Promise<Map<string, string>> {
  const cachePath = join(outDir, "voices.json");
  const previewDir = join(outDir, "voice-previews");
  await mkdir(previewDir, { recursive: true });
  const cache = await readCache(cachePath);
  const ids = new Map<string, string>();

  for (const member of members) {
    const descriptionHash = hash(member.description);
    const cached = cache[member.key];
    if (cached?.descriptionHash === descriptionHash) {
      ids.set(member.key, cached.id);
      console.log(`voice  ${member.key.padEnd(9)} cached   ${cached.id}`);
      continue;
    }
    if (cached !== undefined) {
      await ai.voices.delete(cached.id).catch((error: unknown) => {
        console.warn(`voice  ${member.key}: could not delete stale ${cached.id}`, error);
      });
    }

    const started = performance.now();
    const created = CreatedVoice.parse(
      await ai.voices.create({
        store: true,
        voice: {
          type: "prompted",
          model: TTS_MODEL,
          display_name: member.displayName,
          gender: member.gender,
          language_code: "en-GB",
          prompted: { input: member.description },
        },
      }),
    );
    const ms = Math.round(performance.now() - started);
    console.log(`voice  ${member.key.padEnd(9)} designed ${created.id} in ${String(ms)}ms`);

    if (created.sample_audio !== undefined) {
      await writeFile(join(previewDir, `${member.key}.wav`), Buffer.from(created.sample_audio.data, "base64"));
    }
    cache[member.key] = { id: created.id, descriptionHash };
    ids.set(member.key, created.id);
    await writeFile(cachePath, JSON.stringify(cache, null, 2));
  }
  return ids;
}

function isRetryable(error: unknown): boolean {
  const parsed = ErrorWithStatus.safeParse(error);
  return parsed.success && (parsed.data.status === 429 || parsed.data.status >= 500);
}

export async function synthesize(
  ai: GoogleGenAI,
  request: { readonly text: string; readonly voiceId: string; readonly style: string | undefined },
): Promise<Synthesis> {
  const annotations =
    request.style === undefined ? [] : [{ type: "speech_metadata" as const, style: request.style }];

  for (let attempt = 1; ; attempt++) {
    const started = performance.now();
    try {
      const interaction = await ai.interactions.create({
        model: TTS_MODEL,
        input: [{ type: "user_input", content: [{ type: "text", text: request.text, annotations }] }],
        response_format: { type: "audio", mime_type: "audio/l16", sample_rate: SAMPLE_RATE },
        generation_config: { speech_config: [{ voice: request.voiceId }] },
      });
      const result = SynthesisResult.parse(interaction);
      return {
        pcm: toPcm(Buffer.from(result.output_audio.data, "base64")),
        latencyMs: Math.round(performance.now() - started),
        inputTokens: result.usage?.total_input_tokens,
        outputTokens: result.usage?.total_output_tokens,
      };
    } catch (error: unknown) {
      if (attempt >= 3 || !isRetryable(error)) throw error;
      const backoffMs = 1000 * 2 ** attempt;
      console.warn(`tts retry ${String(attempt)} in ${String(backoffMs)}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}
