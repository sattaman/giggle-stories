// Runs one synthetic story to completion on an isolated SQLite checkpointer, printing each
// pause and the checkpoint history. No credentials, provider calls or tracing.
//   pnpm --filter @storytime/app synthetic [thread-id]

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { compileStoryGraph } from "../src/graph/story-graph.ts";
import { syntheticDeps, syntheticStart } from "./synthetic.ts";

/** Kept apart from the server's data/checkpoints.sqlite so synthetic runs never touch real stories. */
export const DEV_DATA_DIR = join(import.meta.dirname, "..", "..", "..", "data", "dev");

process.env["LANGSMITH_TRACING"] = "false";
await mkdir(DEV_DATA_DIR, { recursive: true });
const saver = SqliteSaver.fromConnString(join(DEV_DATA_DIR, "checkpoints.sqlite"));
const graph = compileStoryGraph(saver);
const threadId = process.argv[2] ?? `synthetic-${String(Date.now())}`;
const config = { configurable: { thread_id: threadId }, context: { deps: syntheticDeps() } };

const replies: unknown[] = ["Moon cheese", { approved: false, feedback: "Make it spookier" }, { approved: true }];
let result = await graph.invoke({ ...syntheticStart, storyId: threadId }, config);
while (isInterrupted(result)) {
  console.log("paused:", JSON.stringify(result[INTERRUPT][0]?.value).slice(0, 100));
  const reply = replies.shift();
  if (reply === undefined) throw new Error("ran out of scripted replies");
  console.log("  reply:", JSON.stringify(reply));
  result = await graph.invoke(new Command({ resume: reply }), config);
}
console.log(`finished: ${String(result.performance.length)} segments performed`);

console.log(`\ncheckpoint history for ${threadId} (step: next nodes)`);
const history = [];
for await (const snapshot of graph.getStateHistory({ configurable: { thread_id: threadId } })) history.unshift(snapshot);
for (const snapshot of history) console.log(`  ${String(snapshot.metadata?.step)}: ${snapshot.next.join(" + ") || "(end)"}`);
saver.db.close();
