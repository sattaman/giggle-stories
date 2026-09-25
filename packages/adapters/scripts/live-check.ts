// Live smoke test of the real adapters (costs a few pence). Not part of `pnpm test`.
//   pnpm --filter @storytime/adapters exec tsx scripts/live-check.ts
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { StoryWriter } from "@storytime/app";
import { DEFAULT_MODELS, OpenRouterStructuredModel } from "../src/index.ts";

Object.assign(process.env, parseEnv(readFileSync(new URL("../../../.env", import.meta.url), "utf8")));
const log = {
  info: (f: object, m: string) => {
    console.log(m, JSON.stringify(f));
  },
  warn: console.warn,
  error: console.error,
};
const models = {
  fast: process.env["STORY_MODEL_FAST"] ?? DEFAULT_MODELS.fast,
  creative: process.env["STORY_MODEL_CREATIVE"] ?? DEFAULT_MODELS.creative,
};
const writer = new StoryWriter(new OpenRouterStructuredModel(process.env["OPENROUTER_API_KEY"] ?? "", log, { models }));

const idea = "a story about my hamster Biscuit who wants to be a famous chef but he's scared of spoons";
const brief = await writer.extractBrief(idea, []);
console.log("BRIEF", JSON.stringify(brief, null, 1));
console.log("DECISION", JSON.stringify(await writer.decide(brief, [])));
const cast = await writer.cast(brief);
console.log("CAST", cast.map((c) => `${c.emoji} ${c.name} (${c.id}) — ${c.comicTrait} | voice: ${c.voiceDescription}`).join("\n"));
const outline = await writer.outline(brief, cast);
console.log("OUTLINE", outline.storyTitle, "\n" + outline.pages.map((p) => `${String(p.page)}. ${p.beat}  [${p.funnyMoment}]`).join("\n"));
const script = await writer.writePage(brief, cast, outline, 1);
console.log("PAGE 1\n" + script.segments.map((s) => `${s.speaker.padEnd(12)} [${s.style}] ${s.text}`).join("\n"));
