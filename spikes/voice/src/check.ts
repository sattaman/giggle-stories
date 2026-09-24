// Connection check: one short line with a *prebuilt* voice (no Voice Design),
// traced to LangSmith, then read back from LangSmith to prove ingestion works.
//
//   pnpm spike:check

import "./env.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentRunTree } from "langsmith/traceable";
import { z } from "zod";
import { createClient, describeError, TTS_MODEL } from "./gemini.js";
import { flushTraces, langsmith, traceable, tracedSynthesize, tracingEnabled } from "./tracing.js";
import { durationMs, toWav } from "./wav.js";

const Env = z.object({ GEMINI_API_KEY: z.string().min(10, "Set GEMINI_API_KEY in storytime/.env") });

const check = traceable(
  async (apiKey: string) => {
    const runId = getCurrentRunTree(true)?.id;
    const synthesis = await tracedSynthesize(createClient(apiKey), {
      text: "Hello! <short pause> If you can hear me, the storytime voices are working. <giggle>",
      voiceId: "Puck",
      style: "cheerful and excited",
    });
    return { runId, synthesis };
  },
  {
    name: "connection_check",
    run_type: "chain",
    client: langsmith,
    tags: ["check"],
    processInputs: () => ({ model: TTS_MODEL, voice: "Puck" }),
    processOutputs: ({ synthesis }) => ({ audio_ms: durationMs(synthesis.pcm), latency_ms: synthesis.latencyMs }),
  },
);

async function main(): Promise<void> {
  const { GEMINI_API_KEY } = Env.parse(process.env);

  console.log(`Gemini  → ${TTS_MODEL}, prebuilt voice "Puck"`);
  const { runId, synthesis } = await check(GEMINI_API_KEY);
  const outDir = join(import.meta.dirname, "..", "out");
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, "check.wav");
  await writeFile(path, toWav(synthesis.pcm));
  console.log(
    `  ✔ ${String(durationMs(synthesis.pcm))}ms of audio in ${String(synthesis.latencyMs)}ms ` +
      `(tokens in/out: ${String(synthesis.inputTokens ?? "?")}/${String(synthesis.outputTokens ?? "?")})`,
  );
  console.log(`  ${path}`);

  if (!tracingEnabled()) {
    console.log("LangSmith → skipped (LANGSMITH_TRACING is not true)");
    return;
  }
  await flushTraces();
  if (runId === undefined) throw new Error("No LangSmith run id captured");
  console.log(`LangSmith → ${process.env["LANGSMITH_ENDPOINT"] ?? "default endpoint"}`);
  const projectName = process.env["LANGSMITH_PROJECT"] ?? "default";
  const project = await langsmith.readProject({ projectName });

  // Ingestion is asynchronous; give it a few seconds to appear.
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const run = await langsmith.runs.retrieve(runId, { project_id: project.id, selects: ["NAME", "TRACE_ID"] });
      const { url } = await langsmith.runs.getURL(runId, { project_id: project.id, trace_id: run.trace_id ?? runId });
      console.log(`  ✔ trace ingested in project "${projectName}": ${run.name ?? "?"}`);
      console.log(`  ${url ?? "(no url returned)"}`);
      return;
    } catch (error: unknown) {
      if (attempt === 6) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error(`\n✖ ${describeError(error)}`);
  process.exitCode = 1;
} finally {
  await flushTraces();
}
