// Phase 0 voice spike: design character voices, perform a hand-written scene one
// line at a time, stitch it into a single WAV, and report latency + cost.
//
//   pnpm spike:voice                     # styled + plain variants
//   pnpm spike:voice --variant styled --play
//   pnpm spike:voice --concurrency 8

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { cast } from "./cast.js";
import { createClient, ensureVoices, synthesize, TTS_MODEL, type Synthesis } from "./gemini.js";
import { scene, type Segment } from "./scene.js";
import { durationMs, silence, toWav } from "./wav.js";

// Paid-tier prices per 1M tokens (checked 2026-09-24; they double on 2027-01-01).
const USD_PER_M_INPUT = 0.5;
const USD_PER_M_AUDIO_OUTPUT = 9.0;
const GAP_MS = 250;

const Env = z.object({ GEMINI_API_KEY: z.string().min(10, "Set GEMINI_API_KEY in storytime/.env") });

const Args = z.object({
  variant: z.enum(["styled", "plain", "both"]),
  concurrency: z.coerce.number().int().min(1).max(20),
  play: z.boolean(),
});

type Variant = "styled" | "plain";

interface SegmentResult extends Synthesis {
  readonly index: number;
  readonly segment: Segment;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      const item = items[i];
      if (item !== undefined) results[i] = await fn(item, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function perform(
  variant: Variant,
  concurrency: number,
  runDir: string,
  voiceFor: (segment: Segment) => string,
  ai: ReturnType<typeof createClient>,
): Promise<string> {
  const dir = join(runDir, variant);
  await mkdir(join(dir, "segments"), { recursive: true });
  console.log(`\n▶ ${variant}: ${String(scene.length)} segments, concurrency ${String(concurrency)}`);

  const started = performance.now();
  const results = await mapWithConcurrency(scene, concurrency, async (segment, index): Promise<SegmentResult> => {
    const synthesis = await synthesize(ai, {
      text: segment.text,
      voiceId: voiceFor(segment),
      style: variant === "styled" ? segment.style : undefined,
    });
    const name = `${String(index + 1).padStart(2, "0")}-${segment.speaker}.wav`;
    await writeFile(join(dir, "segments", name), toWav(synthesis.pcm));
    console.log(
      `  ${String(index + 1).padStart(2)} ${segment.speaker.padEnd(9)} ${String(synthesis.latencyMs).padStart(6)}ms → ${String(durationMs(synthesis.pcm)).padStart(5)}ms audio`,
    );
    return { ...synthesis, index, segment };
  });
  const wallMs = Math.round(performance.now() - started);

  const gap = silence(GAP_MS);
  const page = Buffer.concat(results.flatMap((r) => [r.pcm, gap]));
  const pagePath = join(dir, "page.wav");
  await writeFile(pagePath, toWav(page));

  const inputTokens = results.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
  const outputTokens = results.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0);
  const costUsd = (inputTokens * USD_PER_M_INPUT + outputTokens * USD_PER_M_AUDIO_OUTPUT) / 1_000_000;
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const report = {
    variant,
    model: TTS_MODEL,
    segments: results.length,
    audioMs: durationMs(page),
    wallMs,
    firstSegmentLatencyMs: results[0]?.latencyMs,
    medianSegmentLatencyMs: latencies[Math.floor(latencies.length / 2)],
    maxSegmentLatencyMs: latencies.at(-1),
    inputTokens,
    outputTokens,
    estimatedCostUsd: Number(costUsd.toFixed(4)),
    timeline: results.map((r) => ({
      index: r.index + 1,
      speaker: r.segment.speaker,
      style: variant === "styled" ? r.segment.style : null,
      text: r.segment.text,
      latencyMs: r.latencyMs,
      audioMs: durationMs(r.pcm),
    })),
  };
  await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    `  ✔ ${(report.audioMs / 1000).toFixed(1)}s of audio in ${(wallMs / 1000).toFixed(1)}s wall · median line ${String(report.medianSegmentLatencyMs)}ms · ~$${report.estimatedCostUsd.toFixed(4)}`,
  );
  console.log(`  ${pagePath}`);
  return pagePath;
}

function play(path: string): Promise<void> {
  return new Promise((resolve) => {
    spawn("afplay", [path], { stdio: "inherit" }).on("close", () => {
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const { GEMINI_API_KEY } = Env.parse(process.env);
  const { values } = parseArgs({
    options: {
      variant: { type: "string", default: "both" },
      concurrency: { type: "string", default: "4" },
      play: { type: "boolean", default: false },
    },
  });
  const args = Args.parse(values);

  const outDir = join(import.meta.dirname, "..", "out");
  const runDir = join(outDir, new Date().toISOString().replaceAll(":", "-").slice(0, 19));
  await mkdir(runDir, { recursive: true });

  const ai = createClient(GEMINI_API_KEY);
  const voices = await ensureVoices(ai, cast, outDir);
  const voiceFor = (segment: Segment): string => {
    const id = voices.get(segment.speaker);
    if (id === undefined) throw new Error(`No voice for ${segment.speaker}`);
    return id;
  };

  const variants: readonly Variant[] = args.variant === "both" ? ["styled", "plain"] : [args.variant];
  const pages: string[] = [];
  for (const variant of variants) {
    pages.push(await perform(variant, args.concurrency, runDir, voiceFor, ai));
  }

  console.log(`\nVoice previews: ${join(outDir, "voice-previews")}`);
  if (args.play) for (const page of pages) await play(page);
}

await main();
