// One-off voice assets shared by every story, created once and cached in DATA_DIR:
// - stock cartoon voices (fallbacks when a character's own voice design is rejected)
// - narrator lines that guide the child through making a story (GET /v1/narration)

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AudioStore, Logger, SpeechSynthesizer, VoiceDesigner } from "@storytime/app";
import { NarrationKey, VoiceArchetype, type NarrationClips } from "@storytime/domain";
import { z } from "zod";

type Gender = "female" | "male" | "neutral";

/** Cartoon framing passes Voice Design's child-voice filter (verified 2026-09-24 for "female"). */
const STOCK_DESCRIPTIONS: Record<Gender, string> = {
  female: "A very high, soft, adorable animated-character voice, bouncy and excitable, with a British accent.",
  male: "A bright, bouncy, energetic cartoon hero's voice, cheeky and fast-talking, with a British accent.",
  neutral: "A cheerful, playful animated-character voice, bright and bouncy, with a British accent.",
};

/** Ready-made voices by archetype. Gender stated plainly; no child wording (Voice Design rules). */
export const LIBRARY: Record<VoiceArchetype, { readonly gender: Gender; readonly description: string }> = {
  "kid-hero-female": { gender: "female", description: STOCK_DESCRIPTIONS.female },
  "kid-cheeky-female": {
    gender: "female",
    description: "A bright, quick, mischievous female cartoon heroine's voice with a cheeky giggle in it, with a British accent.",
  },
  "kid-posh-female": {
    gender: "female",
    description: "A high, bright, crisp animated-character voice with a very posh British accent, prim, precise and bossy, every word perfectly pronounced.",
  },
  "kid-rough-female": {
    gender: "female",
    description: "A high, bright, slightly husky animated-character voice with a broad Yorkshire accent, blunt, tough and full of beans.",
  },
  mum: { gender: "female", description: "A warm, kind, gently humorous female voice, calm and reassuring, with a British accent." },
  granny: {
    gender: "female",
    description: "A crackly, cheerful, slightly wobbly elderly female voice, full of warmth and mischief, with a Yorkshire accent.",
  },
  "villain-female": {
    gender: "female",
    description: "A silky, sly, theatrical female villain's voice, purring and dramatic, with a posh British accent.",
  },
  "animal-female": {
    gender: "female",
    description: "A lively female cartoon animal voice, warmly rounded and slightly breathy, bouncing with eager, friendly energy, with a British accent.",
  },
  "kid-hero-male": { gender: "male", description: STOCK_DESCRIPTIONS.male },
  "kid-cheeky-male": {
    gender: "male",
    description: "A scratchy, mischievous male cartoon voice, fast-talking and full of schemes, with a London accent.",
  },
  "kid-posh-male": {
    gender: "male",
    description: "A high, bright, clipped animated-character voice with a very posh British accent, pompous, show-offy and easily outraged.",
  },
  "kid-rough-male": {
    gender: "male",
    description: "A raspy, fast-talking male cartoon voice with a broad Mancunian accent, loud, blunt and cheeky.",
  },
  dad: { gender: "male", description: "A friendly, slightly goofy male voice, warm and upbeat, who loves a bad joke, with a British accent." },
  grandad: { gender: "male", description: "A jolly, gravelly elderly male voice, slow and chuckling, with a West Country accent." },
  "villain-male": {
    gender: "male",
    description: "A booming, pompous, old-fashioned male English aristocrat's voice, theatrical and easily offended.",
  },
  "creature-male": {
    gender: "male",
    description: "A gravelly, grumbling, slow male creature voice with a Scottish accent, secretly soft-hearted.",
  },
  "creature-neutral": { gender: "neutral", description: STOCK_DESCRIPTIONS.neutral },
  robot: {
    gender: "neutral",
    description: "A crisp, precise, slightly metallic robot voice, polite and very literal, with clipped British diction.",
  },
};

/**
 * Designs any missing library voices (once; cached on disk) and fills `target` as each is ready,
 * so stories started meanwhile simply design their own voices.
 */
export async function ensureVoiceLibrary(
  voices: VoiceDesigner,
  dataDir: string,
  log: Logger,
  target: Partial<Record<VoiceArchetype, string>>,
): Promise<void> {
  const path = join(dataDir, "voice-library.json");
  let cache: z.infer<typeof StockCache> = {};
  try {
    cache = StockCache.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    // Not cached yet.
  }
  const missing: VoiceArchetype[] = [];
  for (const archetype of VoiceArchetype.options) {
    const cached = cache[archetype];
    if (cached?.descriptionHash === hash(LIBRARY[archetype].description)) target[archetype] = cached.voiceId;
    else missing.push(archetype);
  }
  if (missing.length > 0) log.info({ missing: missing.length }, "designing voice library (one-off)");
  for (const archetype of missing) {
    const { gender, description } = LIBRARY[archetype];
    try {
      const { voiceId } = await voices.design({ name: `library-${archetype}`, gender, description });
      cache[archetype] = { voiceId, descriptionHash: hash(description) };
      target[archetype] = voiceId;
      await mkdir(dataDir, { recursive: true });
      await writeFile(path, JSON.stringify(cache, null, 2));
    } catch (error: unknown) {
      log.warn({ archetype, error: String(error) }, "library voice design failed; stories will design their own");
    }
  }
  log.info({ ready: Object.keys(target).length, total: VoiceArchetype.options.length }, "voice library ready");
}

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
        const { wav } = await this.speech.synthesize({
          text: line.text,
          voiceId: this.narratorVoiceId,
          fallbackVoice: "Charon",
          style: line.style,
        });
        this.clips.set(key, await this.audio.save("narration", name, wav));
      } catch (error: unknown) {
        this.log.warn({ key, error: String(error) }, "narration clip failed");
      }
    }
    this.log.info({ ready: this.clips.size, total: NarrationKey.options.length }, "narration clips ready");
  }
}
