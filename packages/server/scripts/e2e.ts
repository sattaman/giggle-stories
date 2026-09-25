// Drives one whole story through the real /v1 API, like the app would.
//   node_modules/.bin/tsx packages/server/scripts/e2e.ts "story idea" ["answer to any question"]
// Costs a few pence (LLM + TTS). Prints timings for each phase.

import { StoryView, type StoryView as View } from "@storytime/domain";

const base = process.env["API_URL"] ?? "http://localhost:8787";
const idea = process.argv[2] ?? "My hamster Biscuit wants to be a famous chef but he is scared of spoons";
const answer = process.argv[3] ?? "Make it really silly!";
const ageBand = process.env["AGE_BAND"] ?? "9-12";
const t0 = performance.now();
const secs = (): string => `${((performance.now() - t0) / 1000).toFixed(1)}s`;

async function call(path: string, body?: unknown): Promise<View> {
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${String(res.status)} ${await res.text()}`);
  return StoryView.parse(await res.json());
}

async function settle(id: string, until: (v: View) => boolean): Promise<View> {
  let lastMessage = "";
  for (;;) {
    const view = await call(`/v1/stories/${id}`);
    if (view.message !== null && view.message !== lastMessage) {
      lastMessage = view.message;
      console.log(`  ${secs().padStart(6)}  ${view.message}`);
    }
    if (view.status === "error") throw new Error(view.error ?? "story error");
    if (until(view)) return view;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

let view = await call("/v1/stories", { idea, ageBand });
console.log(`story ${view.id} (${ageBand}): "${idea}"`);
view = await settle(view.id, (v) => v.status === "waiting");

while (view.pending?.kind === "clarification") {
  console.log(`  ${secs().padStart(6)}  ❓ ${view.pending.question}  (audio: ${view.pending.questionAudioUrl ?? "none"})`);
  view = await call(`/v1/stories/${view.id}/replies`, { kind: "answer", text: answer });
  view = await settle(view.id, (v) => v.status === "waiting");
}

if (view.pending?.kind !== "outline_review") throw new Error("expected outline review");
console.log(`  ${secs().padStart(6)}  📋 ${view.pending.outline.storyTitle}`);
for (const p of view.pending.outline.pages) console.log(`          ${String(p.page)}. ${p.beat}`);
for (const c of view.characters) console.log(`          ${c.emoji} ${c.name} [${c.gender}]: ${c.voice?.source ?? "no"} voice ${c.voice?.voiceId ?? ""} sample=${c.voice?.sampleUrl === null ? "no" : "yes"}\n             “${c.hello}”\n             voice: ${c.voiceDescription}`);

view = await call(`/v1/stories/${view.id}/replies`, { kind: "outline", approved: true });
const approvedAt = performance.now();
let firstAudioAt: number | undefined;
view = await settle(view.id, (v) => {
  if (firstAudioAt === undefined && v.performance?.segments[0]?.audioUrl != null) firstAudioAt = performance.now();
  return v.status === "done";
});

const segments = view.performance?.segments ?? [];
console.log(`\nPAGE 1 (${String(segments.length)} lines)`);
for (const s of segments) console.log(`  ${s.speaker.padEnd(14)} [${s.style}] ${s.text}${s.audioUrl === null ? "  ⚠️ no audio" : ""}`);
const audioMs = segments.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
console.log(
  `\ntotal ${secs()} · approve→first line ${firstAudioAt === undefined ? "?" : ((firstAudioAt - approvedAt) / 1000).toFixed(1)}s · approve→done ${((performance.now() - approvedAt) / 1000).toFixed(1)}s · page audio ${(audioMs / 1000).toFixed(0)}s`,
);
