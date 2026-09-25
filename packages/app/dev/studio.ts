// LangGraph Studio entry point (see langgraph.json). Synthetic dependencies only.
//
// The dev server owns persistence (it compiles in its own checkpointer) and the run context
// (it replaces any `withConfig({ context })` with the assistant's JSON context). Dependencies
// aren't serialisable, so they are built in as defaults instead.

import { buildStoryGraph } from "../src/graph/story-graph.ts";
import { syntheticDeps } from "../testing/synthetic.ts";

export const graph = buildStoryGraph({ defaultDeps: syntheticDeps() }).compile({ name: "storytime" });
