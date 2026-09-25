// StructuredModel port → OpenRouter via LangChain's ChatOpenRouter. LangChain runs are traced
// to LangSmith automatically (LANGSMITH_TRACING), nested under the LangGraph node.
//
// Structured output uses function calling with `includeRaw: true`, so this adapter sees the
// raw AIMessage: it validates the tool-call arguments itself, re-asks once with the zod
// issues when they don't fit, reads token usage, and knows when the answer was cut off.

import type { Logger, StructuredModel } from "@storytime/app";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenRouter } from "@langchain/openrouter";
import { z } from "zod";

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

export interface OpenRouterOptions {
  readonly models?: OpenRouterModels;
  /** Test seam: point at a fake OpenRouter API. */
  readonly baseURL?: string;
}

/** The model ran out of output tokens; asking again would be cut off the same way. */
export class TruncatedOutputError extends Error {
  constructor(readonly task: string) {
    super(`Model output for ${task} was cut off (finish_reason: length)`);
    this.name = "TruncatedOutputError";
  }
}

/** One structured call: the raw message (validated below) and LangChain's parse, if it succeeded. */
export type StructuredAttempt = (correction: string | undefined) => Promise<{ readonly raw: unknown }>;

// The parts of LangChain's AIMessage this adapter relies on, checked at the boundary.
const RawMessage = z.object({
  tool_calls: z.array(z.object({ name: z.string(), args: z.unknown() })).default([]),
  usage_metadata: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
  response_metadata: z.object({ finish_reason: z.string().optional() }).loose().default({}),
});

export class OpenRouterStructuredModel implements StructuredModel {
  readonly models: OpenRouterModels;
  private readonly fast: ChatOpenRouter;
  private readonly creative: ChatOpenRouter;

  constructor(
    apiKey: string,
    private readonly log: Logger,
    options: OpenRouterOptions = {},
  ) {
    this.models = options.models ?? DEFAULT_MODELS;
    // Transport retries (429/5xx/network, honouring Retry-After) happen inside LangChain.
    const common = { apiKey, siteName: "Storytime", maxRetries: 3, ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }) };
    this.fast = new ChatOpenRouter({ ...common, model: this.models.fast, temperature: 0.2 });
    this.creative = new ChatOpenRouter({ ...common, model: this.models.creative, temperature: 0.9, maxTokens: 4000 });
  }

  async generate<S extends z.ZodType>(request: {
    readonly task: string;
    readonly schema: S;
    readonly system: string;
    readonly prompt: string;
    readonly creative: boolean;
    readonly signal?: AbortSignal;
  }): Promise<z.infer<S>> {
    const chat = request.creative ? this.creative : this.fast;
    const model = request.creative ? this.models.creative : this.models.fast;
    const structured = chat
      .withStructuredOutput(request.schema, { name: request.task, method: "functionCalling", includeRaw: true })
      .withConfig({ runName: request.task, metadata: { task: request.task, model } });
    const attempt: StructuredAttempt = (correction) =>
      structured.invoke(
        [
          new SystemMessage(request.system),
          new HumanMessage(correction === undefined ? request.prompt : `${request.prompt}\n\n${correction}`),
        ],
        request.signal === undefined ? {} : { signal: request.signal },
      );

    const started = performance.now();
    const { value, usage } = await generateWithCorrection(attempt, request.schema, this.log, { task: request.task, model });
    this.log.info({ task: request.task, model, ms: Math.round(performance.now() - started), ...usage }, "llm call");
    return value;
  }
}

/**
 * Runs `attempt`, validates the tool-call arguments against `schema`, and re-asks once with
 * the zod issues if they don't fit. Transport errors propagate untouched (LangChain has
 * already retried them). Token usage is summed across attempts.
 */
export async function generateWithCorrection<S extends z.ZodType>(
  attempt: StructuredAttempt,
  schema: S,
  log: Logger,
  fields: { readonly task: string; readonly model: string },
): Promise<{ value: z.infer<S>; usage: { inputTokens: number; outputTokens: number } }> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  let correction: string | undefined;
  for (let round = 1; ; round++) {
    const message = RawMessage.parse((await attempt(correction)).raw);
    usage.inputTokens += message.usage_metadata?.input_tokens ?? 0;
    usage.outputTokens += message.usage_metadata?.output_tokens ?? 0;
    if (message.response_metadata.finish_reason === "length") throw new TruncatedOutputError(fields.task);

    const call = message.tool_calls.find((c) => c.name === fields.task);
    const problem =
      call === undefined
        ? `You didn't call the ${fields.task} tool. Answer by calling it.`
        : issuesOf(schema.safeParse(call.args));
    if (problem === undefined && call !== undefined) return { value: schema.parse(call.args), usage };
    if (round === 2) throw new Error(`Model output for ${fields.task} was invalid after a correction: ${problem ?? ""}`);

    log.warn({ ...fields, problem }, "llm output invalid; asking again");
    correction = `Your previous answer didn't fit the required format:\n${problem ?? ""}\nReturn a corrected answer.`;
  }
}

function issuesOf(result: z.ZodSafeParseResult<unknown>): string | undefined {
  return result.success ? undefined : z.prettifyError(result.error);
}
