// Illustrator port → OpenRouter's Images API (POST /api/v1/images). Any OpenRouter image
// model works; pick one with STORY_IMAGE_MODEL. Called directly because ChatOpenRouter
// (0.4.x) doesn't support image output. The response is validated with zod, and each
// picture's reported cost is logged.

import type { ImageType, Illustrator, Logger } from "@storytime/app";
import { z } from "zod";

/** Cheap, fast and good at following descriptions; overridable with STORY_IMAGE_MODEL. */
export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";

const ImagesResponse = z.object({
  data: z
    .array(z.object({ b64_json: z.string().min(1), media_type: z.enum(["image/png", "image/jpeg", "image/webp"]) }))
    .min(1),
  usage: z.object({ cost: z.number().optional() }).optional(),
});

export interface OpenRouterIllustratorOptions {
  readonly model?: string;
  /** Test seam: point at a fake OpenRouter API. */
  readonly baseURL?: string;
}

export class OpenRouterIllustrator implements Illustrator {
  readonly model: string;
  private readonly baseURL: string;

  constructor(
    private readonly apiKey: string,
    private readonly log: Logger,
    options: OpenRouterIllustratorOptions = {},
  ) {
    this.model = options.model ?? DEFAULT_IMAGE_MODEL;
    this.baseURL = options.baseURL ?? "https://openrouter.ai/api/v1";
  }

  async draw(request: { readonly prompt: string; readonly signal?: AbortSignal | undefined }): Promise<{
    readonly image: Uint8Array;
    readonly type: ImageType;
  }> {
    const started = performance.now();
    const response = await fetch(`${this.baseURL}/images`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "x-title": "Storytime" },
      // A 4:3 page picture at 1K is plenty for a tablet screen.
      body: JSON.stringify({ model: this.model, prompt: request.prompt, n: 1, aspect_ratio: "4:3", resolution: "1K" }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    if (!response.ok) throw new Error(`OpenRouter images ${String(response.status)}: ${(await response.text()).slice(0, 300)}`);
    const body: unknown = await response.json();
    const { data, usage } = ImagesResponse.parse(body);
    const [first] = data;
    if (first === undefined) throw new Error("OpenRouter images returned no image");
    const image = Buffer.from(first.b64_json, "base64");
    this.log.info(
      { model: this.model, ms: Math.round(performance.now() - started), bytes: image.byteLength, costUsd: usage?.cost ?? null },
      "image drawn",
    );
    return { image, type: first.media_type };
  }
}
