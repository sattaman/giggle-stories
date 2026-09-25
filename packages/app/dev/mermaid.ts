// Regenerates dev/story-graph.mmd from the real builder:
//   pnpm --filter @storytime/app graph:mermaid
// A test fails when the committed diagram drifts from the graph.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildStoryGraph } from "../src/graph/story-graph.ts";

export const MERMAID_PATH = join(import.meta.dirname, "story-graph.mmd");

export async function storyGraphMermaid(): Promise<string> {
  const drawable = await buildStoryGraph().compile({ name: "storytime" }).getGraphAsync();
  return drawable.drawMermaid();
}

if (process.argv[1] === import.meta.filename) {
  await writeFile(MERMAID_PATH, `${await storyGraphMermaid()}\n`);
  console.log(`wrote ${MERMAID_PATH}`);
}
