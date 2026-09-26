// Picture evals in LangSmith: which image model (and consistency strategy) gives the best
// picture book for the money? Each dataset example is a whole 3-page story, so consistency
// across pages can be judged. One LangSmith experiment per model × strategy.
//
//   pnpm --filter @storytime/evals pictures                 # all models × both strategies
//   pnpm --filter @storytime/evals pictures -- --models google/gemini-3.1-flash-lite-image --strategies reference
//   pnpm --filter @storytime/evals pictures -- --dataset-only
//
// Strategies: "text" = every page drawn from its description alone (what the app does today);
// "reference" = pages 2+ also get page 1's picture to copy the characters from.

import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { OpenRouterIllustrator } from "@storytime/adapters";
import { illustrationPrompt, type Logger, type ReferencePicture } from "@storytime/app";
import { AgeBand, CharacterProfile, PageScript, StoryBrief } from "@storytime/domain";
import sharp from "sharp";
import { z } from "zod";
import { judgeStory } from "./judge.ts";
import { STORIES } from "./stories.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
// The project .env wins over the shell (see CLAUDE.md), and must be loaded before any LangSmith client exists.
Object.assign(process.env, parseEnv(readFileSync(join(ROOT, ".env"), "utf8")));
const { Client } = await import("langsmith");
const { evaluate } = await import("langsmith/evaluation");
const { traceable } = await import("langsmith/traceable");

const DATASET = "storytime-picture-stories";
const PROMPT_VERSION = "illustration-v2 (no-text last, page lines as context)";
const OUT = join(ROOT, "data", "evals", "pictures");

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    models: { type: "string", default: "google/gemini-3.1-flash-image,google/gemini-3.1-flash-lite-image,openai/gpt-5-image-mini" },
    strategies: { type: "string", default: "text,reference" },
    "dataset-only": { type: "boolean", default: false },
  },
});
const models = args.models.split(",").filter((m) => m !== "");
const strategies = z.array(z.enum(["text", "reference"])).parse(args.strategies.split(",").filter((s) => s !== ""));
const apiKey = z.string().min(10).parse(process.env["OPENROUTER_API_KEY"]);
const client = new Client();

// ── Dataset: one example per story ────────────────────────────────────────────
const StoryInputs = z.object({ title: z.string(), ageBand: AgeBand, brief: StoryBrief, cast: z.array(CharacterProfile), pages: z.array(PageScript) });

if (!(await client.hasDataset({ datasetName: DATASET }))) {
  const dataset = await client.createDataset(DATASET, {
    description: "Synthetic 3-page stories for comparing illustration models on page match and character consistency.",
  });
  await client.createExamples(STORIES.map((story) => ({ dataset_id: dataset.id, inputs: { ...story }, metadata: { title: story.title } })));
  console.log(`created dataset ${DATASET} with ${String(STORIES.length)} stories`);
}
if (args["dataset-only"]) process.exit(0);

// ── Target: draw a story's pages in order ─────────────────────────────────────
/** A traced step whose attachment shows the picture in LangSmith. */
const pagePicture = traceable((page: { readonly page: number; readonly jpeg: Uint8Array }) => ({ page: page.page, bytes: page.jpeg.byteLength }), {
  name: "page_picture",
  extractAttachments: (page) => [{ [`page_${String(page.page)}`]: { mimeType: "image/jpeg", data: page.jpeg } }, { page: page.page }],
});

function drawStory(model: string, strategy: "text" | "reference") {
  return async (raw: Record<string, unknown>) => {
    const story = StoryInputs.parse(raw);
    const costs: number[] = [];
    const log: Logger = {
      info: (fields) => {
        const cost = z.object({ costUsd: z.number() }).safeParse(fields);
        if (cost.success) costs.push(cost.data.costUsd);
      },
      warn: () => undefined,
      error: () => undefined,
    };
    const illustrator = new OpenRouterIllustrator(apiKey, log, { model });
    const started = performance.now();
    const references: ReferencePicture[] = [];
    const files: string[] = [];
    for (const script of story.pages) {
      const withReferences = strategy === "reference" && references.length > 0;
      const prompt = illustrationPrompt({ brief: story.brief, cast: story.cast, script, ageBand: story.ageBand, withReferences });
      const { image } = await illustrator.draw({ prompt, references: withReferences ? references : undefined });
      const jpeg = await sharp(image).resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      // Always page 1 as the anchor, never the previous page, so drift can't accumulate.
      if (strategy === "reference" && references.length === 0) references.push({ image: jpeg, type: "image/jpeg" });
      const file = join(OUT, slug(`${model}-${strategy}`), `${slug(story.title)}-p${String(script.page)}.jpg`);
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(file, jpeg);
      files.push(file);
      await pagePicture({ page: script.page, jpeg });
    }
    const costUsd = costs.length === story.pages.length ? costs.reduce((a, b) => a + b, 0) : null; // null = unknown, not zero
    return { pictures: files, costUsd, seconds: Math.round((performance.now() - started) / 1000) };
  };
}

// ── Evaluators ────────────────────────────────────────────────────────────────
const Outputs = z.object({ pictures: z.array(z.string()), costUsd: z.number().nullable(), seconds: z.number() });

async function judge({ inputs, outputs }: { inputs: Record<string, unknown>; outputs: Record<string, unknown> }) {
  const story = StoryInputs.parse(inputs);
  const { pictures } = Outputs.parse(outputs);
  const { verdict } = await judgeStory({ apiKey, brief: story.brief, cast: story.cast, pages: story.pages, pictures: pictures.map((p) => readFileSync(p)) });
  return {
    results: [
      { key: "character_consistency", score: verdict.character_consistency, comment: verdict.consistency_notes },
      { key: "matches_pages", score: verdict.matches_pages },
      { key: "no_text", score: verdict.has_text ? 0 : 1 },
      { key: "child_appeal", score: verdict.child_appeal, comment: verdict.notes },
    ],
  };
}

function costAndTime({ outputs }: { outputs: Record<string, unknown> }) {
  const { costUsd, seconds } = Outputs.parse(outputs);
  const cost = costUsd === null ? { key: "cost_usd", comment: "cost unknown" } : { key: "cost_usd", score: costUsd };
  return { results: [cost, { key: "seconds", score: seconds }] };
}

// ── Run: one experiment per model × strategy ─────────────────────────────────
/** Saved beside each experiment's pictures, so the contact sheet covers every run so far. */
const SheetRows = z.array(z.object({ title: z.string(), pictures: z.array(z.string()), scores: z.record(z.string(), z.unknown()) }));
for (const model of models) {
  for (const strategy of strategies) {
    console.log(`\n▶ ${model} / ${strategy}`);
    const results = await evaluate(drawStory(model, strategy), {
      data: DATASET,
      evaluators: [judge, costAndTime],
      experimentPrefix: `pictures-${slug(model)}-${strategy}`,
      description: `${model}, ${strategy === "reference" ? "page 1 as reference for later pages" : "text only"}`,
      metadata: { model, strategy, prompt_version: PROMPT_VERSION, judge: "openai/gpt-6-luna-pro" },
      maxConcurrency: 3,
      client,
    });
    const rows: z.infer<typeof SheetRows> = [];
    for (const row of results.results) {
      const outputs = Outputs.safeParse(row.run.outputs);
      const scores = Object.fromEntries(row.evaluationResults.results.map((r) => [r.key, r.score]));
      const title = z.object({ title: z.string() }).safeParse(row.example.inputs);
      console.log(`  ${title.success ? title.data.title : "?"}: ${JSON.stringify(scores)}`);
      if (outputs.success) rows.push({ title: title.success ? title.data.title : "?", pictures: outputs.data.pictures, scores });
    }
    const dir = join(OUT, slug(`${model}-${strategy}`));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "scores.json"), JSON.stringify({ model, strategy, rows }, null, 1));
  }
}

const sheet: string[] = [];
await mkdir(OUT, { recursive: true });
for (const dir of (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const saved = z.object({ model: z.string(), strategy: z.string(), rows: SheetRows }).safeParse(JSON.parse(await readFile(join(OUT, dir, "scores.json"), "utf8").catch(() => "{}")));
  if (!saved.success) continue;
  for (const row of saved.data.rows) sheet.push(sheetRow(saved.data.model, saved.data.strategy, row.title, row.pictures, row.scores));
}
await writeFile(
  join(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Picture evals</title><style>body{font:15px system-ui;margin:20px;background:#FFF6E5;color:#2B2257}
td{padding:6px;vertical-align:top;border-bottom:1px solid #EADFCB}img{width:260px;border-radius:8px}small{color:#6B6394}</style>
<h1>Picture evals</h1><table>${sheet.join("")}</table>`,
);
console.log(`\ncontact sheet: ${join(OUT, "index.html")}`);

function sheetRow(model: string, strategy: string, title: string, pictures: readonly string[], scores: Record<string, unknown>): string {
  const cells = pictures.map((p) => `<td><img src="${escapeHtml(pathToFileURL(p).href)}"></td>`).join("");
  return `<tr><td><b>${escapeHtml(title)}</b><br>${escapeHtml(model)}<br><small>${escapeHtml(strategy)}<br>${escapeHtml(JSON.stringify(scores))}</small></td>${cells}</tr>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
