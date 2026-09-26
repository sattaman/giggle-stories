// Voice audition: designs any library voices not yet cached (one-off), then has each young
// library voice say a line in character, and writes a page to listen to them side by side.
//   DATA_DIR=/path/to/data pnpm --filter @storytime/server audition
// Costs one TTS request per voice, plus a voice design for each new library entry.

import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GeminiSpeech, GeminiVoiceDesigner, createGemini } from "@storytime/adapters";
import { VoiceArchetype } from "@storytime/domain";
import { pino } from "pino";
import { loadDotEnv, readConfig } from "../src/config.ts";
import { LIBRARY, ensureVoiceLibrary } from "../src/narration.ts";

/** What each young voice says: short, in character, and fun to compare. */
const LINES: Partial<Record<VoiceArchetype, string>> = {
  "kid-hero-female": "Don't worry, everyone! I've got a plan, and it only involves one small explosion.",
  "kid-cheeky-female": "I didn't eat the last biscuit. <giggle> I just... borrowed it. Forever.",
  "kid-posh-female": "Excuse me, that is MY seat, and I have been sitting in it since nineteen minutes past nine.",
  "kid-rough-female": "Right, you lot. Last one to the top of the hill is a soggy sandwich!",
  "kid-hero-male": "Stand back! This is a job for the bravest person in the whole playground!",
  "kid-cheeky-male": "Shh! If anyone asks, the frog was already in the teacher's bag.",
  "kid-posh-male": "I'll have you know my hamster has won three rosettes. THREE.",
  "kid-rough-male": "Oi! Give us the ball back or I'm telling your nan!",
};

loadDotEnv();
const config = readConfig();
const log = pino({ level: "warn" });
const gemini = createGemini(config.GEMINI_API_KEY);
const voices = new GeminiVoiceDesigner(gemini, log);
const speech = new GeminiSpeech(gemini, log);

const library: Partial<Record<VoiceArchetype, string>> = {};
await ensureVoiceLibrary(voices, config.DATA_DIR, log, library);

const out = join(config.DATA_DIR, "audition");
await mkdir(out, { recursive: true });
const rows: string[] = [];
for (const archetype of VoiceArchetype.options) {
  const line = LINES[archetype];
  if (line === undefined) continue;
  const voiceId = library[archetype];
  const { description } = LIBRARY[archetype];
  if (voiceId === undefined) {
    rows.push(row(archetype, description, line, null));
    continue;
  }
  // One clip per voice: named by voice id, so a redesigned voice is recorded again and nothing else is.
  const file = `${archetype}-${voiceId}.wav`;
  if (!(await exists(join(out, file)))) {
    const { wav, model } = await speech.synthesize({ text: line, voiceId, fallbackVoice: "Puck", style: "in character, playful" });
    await writeFile(join(out, file), wav);
    console.log(`${archetype}: recorded ${voiceId} (${model})`);
  }
  rows.push(row(archetype, description, line, file));
}

await writeFile(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Voice audition</title>
<style>body{font:18px system-ui;margin:24px;background:#FFF6E5;color:#2B2257}td{padding:10px;vertical-align:top;border-bottom:1px solid #EADFCB}
small{color:#6B6394}</style><h1>Voice audition</h1><table>${rows.join("")}</table>`,
);
console.log(`open ${join(out, "index.html")}`);

function row(archetype: string, description: string, line: string, file: string | null): string {
  const player = file === null ? "<em>not designed (blocked?)</em>" : `<audio controls src="${file}"></audio>`;
  return `<tr><td><b>${archetype}</b><br><small>${description}</small></td><td>“${line.replace(/<[^>]+>/g, "")}”</td><td>${player}</td></tr>`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
