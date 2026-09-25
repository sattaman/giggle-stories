// StructuredModel port → OpenRouter via LangChain. LangChain runs are traced to
// LangSmith automatically (LANGSMITH_TRACING), nested under the LangGraph node.

import type { Logger, StructuredModel } from "@storytime/app";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { z } from "zod";

export interface OpenRouterModels {
  /** Quick analytical calls: brief extraction, decisions, voice rewrites. */
  readonly fast: string;
  /** Creative writing: cast, outline, page scripts. */
  readonly creative: string;
}

/** Overridable with STORY_MODEL_FAST / STORY_MODEL_CREATIVE. */
export const DEFAULT_MODELS: OpenRouterModels = {
  fast: "openai/gpt-6-luna",
  creative: "openai/gpt-6-luna-pro",
};

export class OpenRouterStructuredModel implements StructuredModel {
  private readonly fast: ChatOpenRouter;
  private readonly creative: ChatOpenRouter;

  constructor(
    apiKey: string,
    private readonly log: Logger,
    readonly models: OpenRouterModels = DEFAULT_MODELS,
  ) {
    const common = { apiKey, siteName: "Storytime", maxRetries: 3 };
    this.fast = new ChatOpenRouter({ ...common, model: models.fast, temperature: 0.2 });
    this.creative = new ChatOpenRouter({ ...common, model: models.creative, temperature: 0.9, maxTokens: 4000 });
  }

  async generate<S extends z.ZodType>(request: {
    readonly task: string;
    readonly schema: S;
    readonly system: string;
    readonly prompt: string;
    readonly creative: boolean;
  }): Promise<z.infer<S>> {
    const chat = request.creative ? this.creative : this.fast;
    const model = request.creative ? this.models.creative : this.models.fast;
    const started = performance.now();
    const call = (correction: string | undefined) =>
      chat
        .withStructuredOutput(request.schema, { name: request.task })
        .withConfig({ runName: request.task, metadata: { task: request.task, model } })
        .invoke([
          new SystemMessage(request.system),
          new HumanMessage(correction === undefined ? request.prompt : `${request.prompt}\n\n${correction}`),
        ]);

    const result = await generateWithCorrection(call, request.schema, this.log, { task: request.task, model });
    this.log.info({ task: request.task, model, ms: Math.round(performance.now() - started) }, "llm call");
    return result;
  }
}

/**
 * One corrective retry when the output didn't match the schema; any other error propagates.
 * Transport retries (429/5xx) happen below this, inside the SDK (maxRetries: 3).
 */
export async function generateWithCorrection<S extends z.ZodType>(
  call: (correction: string | undefined) => Promise<unknown>,
  schema: S,
  log: Logger,
  fields: { readonly task: string; readonly model: string },
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await call(undefined);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/parse|schema|expected/i.test(message)) throw error;
    log.warn({ ...fields, error: message.slice(0, 300) }, "llm output invalid; retrying");
    raw = await call(`Your previous answer was invalid:\n${message.slice(0, 800)}\nReturn a corrected answer.`);
  }
  // Re-validate at the boundary: provider structured output is not a guarantee.
  return schema.parse(raw);
}
