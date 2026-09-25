// One-off voice assets shared by every story, created once and cached in DATA_DIR:
// - stock cartoon voices (fallbacks when a character's own voice design is rejected)
// - narrator lines that guide the child through making a story (GET /v1/narration)

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AudioStore, Logger, SpeechSynthesizer, VoiceDesigner } from "@storytime/app";
import { NarrationKey, type NarrationClips } from "@storytime/domain";
import { z } from "zod";

type Gender = "female" | "male" | "neutral";

/** Cartoon framing passes Voice Design's child-voice filter (verified 2026-09-24 for "female"). */
const STOCK_DESCRIPTIONS: Record<Gender, string> = {
  female: "A very high, soft, adorable animated-character voice, bouncy and excitable, with a British accent.",
  male: "A bright, bouncy, energetic cartoon hero's voice, cheeky and fast-talking, with a British accent.",
  neutral: "A cheerful, playful animated-character voice, bright and bouncy, with a British accent.",
};

export const NARRATION: Record<NarrationKey, { readonly text: string; readonly style: string }> = {
  welcome: {
    text: "Hello, story maker! I'm your Narrator. Shall we make a brand-new story together? Tap the big button when you're ready!",
    style: "warm, delighted welcome",
  },
  idea: {
    text: "First, pick who the story's for. Then tap the microphone and tell me everything: who's in it, where they are, and what happens!",
    style: "encouraging, curious",
  },
  thinking: {
    text: "Ooh, I like that one! Give me a moment… I'm rounding up your characters.",
    style: "impressed, then conspiratorial",
  },
  voices_intro: {
    text: "Your characters have arrived! They've been practising their voices all morning. Listen closely… here they come!",
    style: "excited, building anticipation",
  },
  voices_outro: {
    text: "Do they sound just right? Now have a look at my plan. If you love it, tap Yes! If not, tap Change something and tell me.",
    style: "warm, helpful",
  },
  changing: { text: "Righto! Changing things now. Back in a jiffy.", style: "brisk, cheerful" },
  ready: { text: "Page one is ready! Get comfy… and tap Start the story!", style: "hushed excitement" },
  the_end: {
    text: "And that's the end of page one! Did anything make you giggle? Shall we make another?",
    style: "fond, playful",
  },
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const hash = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 10);

const StockCache = z.record(z.string(), z.object({ voiceId: z.string(), descriptionHash: z.string() }));

export async function ensureStockVoices(
  voices: VoiceDesigner,
  dataDir: string,
  log: Logger,
): Promise<Partial<Record<Gender, string>>> {
  const path = join(dataDir, "stock-voices.json");
  let cache: z.infer<typeof StockCache> = {};
  try {
    cache = StockCache.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    // Not cached yet.
  }
  const result: Partial<Record<Gender, string>> = {};
  const genders: readonly Gender[] = ["female", "male", "neutral"];
  for (const gender of genders) {
    const description = STOCK_DESCRIPTIONS[gender];
    const cached = cache[gender];
    if (cached?.descriptionHash === hash(description)) {
      result[gender] = cached.voiceId;
      continue;
    }
    try {
      const { voiceId } = await voices.design({ name: `stock-${gender}`, gender, description });
      cache[gender] = { voiceId, descriptionHash: hash(description) };
      result[gender] = voiceId;
      log.info({ gender, voiceId }, "stock cartoon voice designed");
    } catch (error: unknown) {
      log.warn({ gender, error: String(error) }, "stock voice design failed; catalogue voice will be used instead");
    }
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2));
  return result;
}

/**
 * Narrator clips, generated lazily in the background and cached on disk by text+style+voice,
 * so they cost TTS quota once, not per story. Missing clips are null until ready.
 */
export class Narration {
  private readonly clips = new Map<NarrationKey, string>();

  constructor(
    private readonly speech: SpeechSynthesizer,
    private readonly audio: AudioStore & {
      pathFor(storyId: string, file: string): string | undefined;
      urlFor(storyId: string, file: string): string;
    },
    private readonly narratorVoiceId: string,
    private readonly log: Logger,
  ) {}

  view(): NarrationClips {
    const clips = Object.fromEntries(NarrationKey.options.map((key) => [key, this.clips.get(key) ?? null]));
    return { clips: z.record(NarrationKey, z.string().nullable()).parse(clips) };
  }

  async prepare(): Promise<void> {
    for (const key of NarrationKey.options) {
      const line = NARRATION[key];
      const name = `${key.replaceAll("_", "-")}-${hash(`${line.text}|${line.style}|${this.narratorVoiceId}`)}`;
      const path = this.audio.pathFor("narration", `${name}.wav`);
      if (path !== undefined && (await exists(path))) {
        this.clips.set(key, this.audio.urlFor("narration", `${name}.wav`));
        continue;
      }
      try {
        const { wav } = await this.speech.synthesize({ text: line.text, voiceId: this.narratorVoiceId, style: line.style });
        this.clips.set(key, await this.audio.save("narration", name, wav));
      } catch (error: unknown) {
        this.log.warn({ key, error: String(error) }, "narration clip failed");
      }
    }
    this.log.info({ ready: this.clips.size, total: NarrationKey.options.length }, "narration clips ready");
  }
}
