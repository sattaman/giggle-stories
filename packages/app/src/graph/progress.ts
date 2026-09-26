// Progress events the story graph emits on LangGraph's "custom" stream.
//
// Nodes call `report(config, event)`, which writes to `config.writer`. Whoever runs the graph
// with `streamMode: "custom"` receives the events (the server's runner, Studio); a plain
// `invoke` ignores them. Progress is presentation only: story results live in state.

import { StoryStage } from "@storytime/domain";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { z } from "zod";

export const StoryProgress = z.discriminatedUnion("kind", [
  /** The story moved to a new stage; `message` is a friendly line for the child. */
  z.object({ kind: z.literal("stage"), stage: StoryStage, message: z.string() }),
  /** A line of page 1 has been performed, so the child can start listening before the rest. */
  z.object({ kind: z.literal("segment"), index: z.number().int(), audioUrl: z.string(), durationMs: z.number() }),
]);
export type StoryProgress = z.infer<typeof StoryProgress>;

export function report(config: Pick<LangGraphRunnableConfig, "writer">, event: StoryProgress): void {
  config.writer?.(event);
}
