import { readFile } from "node:fs/promises";
import { Command, INTERRUPT, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { buildStoryGraph } from "../src/graph/story-graph.ts";
import { MERMAID_PATH, storyGraphMermaid } from "../dev/mermaid.ts";
import { SyntheticModel, syntheticDeps, syntheticStart } from "../dev/synthetic.ts";

describe("development wiring", () => {
  it("keeps the committed Mermaid diagram in step with the graph", async () => {
    const committed = await readFile(MERMAID_PATH, "utf8");
    // Regenerate with: pnpm --filter @storytime/app graph:mermaid
    expect(committed.trim()).toBe((await storyGraphMermaid()).trim());
  });

  it("runs a synthetic story with default deps when the host sends no deps (as Studio does)", async () => {
    const model = new SyntheticModel();
    const graph = buildStoryGraph({ defaultDeps: syntheticDeps({ model }) }).compile({ checkpointer: new MemorySaver() });
    const config = { configurable: { thread_id: "studio-1" }, context: { deps: undefined } };

    const question = await graph.invoke(syntheticStart, config);
    if (!isInterrupted(question)) throw new Error("expected a clarification");
    expect(question[INTERRUPT][0]?.value).toMatchObject({ kind: "clarification" });

    const review = await graph.invoke(new Command({ resume: "Moon cheese" }), config);
    if (!isInterrupted(review)) throw new Error("expected outline review");
    expect(review[INTERRUPT][0]?.value).toMatchObject({ kind: "outline_review" });

    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(done.performance).toHaveLength(4);
    expect(model.calls).toContain("write_page");
  });

  it("still fails loudly in production wiring when deps are missing", async () => {
    const graph = buildStoryGraph().compile({ checkpointer: new MemorySaver() });
    await expect(graph.invoke(syntheticStart, { configurable: { thread_id: "prod-1" }, context: { deps: undefined } })).rejects.toThrow(
      "Story graph invoked without context.deps",
    );
  });
});
