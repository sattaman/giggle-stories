// SceneDrawer port → a text model on OpenRouter that writes an animated SVG by hand. Uses the
// chat completions API directly for the reasoning-effort setting and the reported cost; the
// SVG is taken from the answer's ```svg block (the app checks it's safe before saving it).

import { extractSvg, type Logger, type SceneDrawer } from "@storytime/app";
import { z } from "zod";

/** Measured on a real page: medium effort drew the best scene (56 s, $0.0065); high was slower and no better. */
export const DEFAULT_SCENE_MODEL = "openai/gpt-6-luna-pro";
const EFFORT = "medium";

const ChatResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({ completion_tokens: z.number(), cost: z.number().optional() }).optional(),
});

export interface OpenRouterSceneDrawerOptions {
  readonly model?: string;
  /** Test seam: point at a fake OpenRouter API. */
  readonly baseURL?: string;
}

export class OpenRouterSceneDrawer implements SceneDrawer {
  readonly model: string;
  private readonly baseURL: string;

  constructor(
    private readonly apiKey: string,
    private readonly log: Logger,
    options: OpenRouterSceneDrawerOptions = {},
  ) {
    this.model = options.model ?? DEFAULT_SCENE_MODEL;
    this.baseURL = options.baseURL ?? "https://openrouter.ai/api/v1";
  }

  async draw(request: { readonly prompt: string; readonly signal?: AbortSignal | undefined }): Promise<{ readonly svg: string }> {
    const started = performance.now();
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "x-title": "Storytime" },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: EFFORT },
        usage: { include: true },
        messages: [{ role: "user", content: request.prompt }],
      }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    if (!response.ok) throw new Error(`OpenRouter chat ${String(response.status)}: ${(await response.text()).slice(0, 300)}`);
    const body: unknown = await response.json();
    const { choices, usage } = ChatResponse.parse(body);
    const svg = extractSvg(choices[0]?.message.content ?? "");
    if (svg === undefined) throw new Error("The model's answer had no ```svg block");
    this.log.info(
      { model: this.model, effort: EFFORT, ms: Math.round(performance.now() - started), outputTokens: usage?.completion_tokens ?? null, costUsd: usage?.cost ?? null, bytes: svg.length },
      "scene drawn",
    );
    return { svg };
  }
}
