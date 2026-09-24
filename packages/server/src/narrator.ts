// The narrator is the same for every story: design its voice once and cache the id.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger, VoiceDesigner } from "@storytime/app";
import { z } from "zod";

export const NARRATOR_DESCRIPTION =
  "A warm, rich-voiced middle-aged British storyteller with a dry wit and impeccable comic timing, who always sounds very slightly exasperated with his own characters.";

const Cached = z.object({ voiceId: z.string(), descriptionHash: z.string() });

export async function ensureNarratorVoice(voices: VoiceDesigner, dataDir: string, log: Logger): Promise<string> {
  const path = join(dataDir, "narrator-voice.json");
  const descriptionHash = createHash("sha256").update(NARRATOR_DESCRIPTION).digest("hex").slice(0, 12);
  try {
    const cached = Cached.parse(JSON.parse(await readFile(path, "utf8")));
    if (cached.descriptionHash === descriptionHash) return cached.voiceId;
  } catch {
    // Not cached yet.
  }
  try {
    log.info({}, "designing narrator voice (one-off, ~30s)");
    const { voiceId } = await voices.design({ name: "narrator", gender: "male", description: NARRATOR_DESCRIPTION });
    await mkdir(dataDir, { recursive: true });
    await writeFile(path, JSON.stringify({ voiceId, descriptionHash }, null, 2));
    return voiceId;
  } catch (error: unknown) {
    log.warn({ error: String(error) }, "narrator voice design failed; using catalogue voice");
    return voices.fallback("male", 3);
  }
}
