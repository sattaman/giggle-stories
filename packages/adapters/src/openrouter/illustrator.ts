// Illustrator port → OpenRouter's Images API (POST /api/v1/images). Any OpenRouter image
// model works; pick one with STORY_IMAGE_MODEL. Called directly because ChatOpenRouter
// (0.4.x) doesn't support image output. The response is validated with zod, and each
// picture's reported cost is logged.

import type { ImageType, Illustrator, Logger, ReferencePicture } from "@storytime/app";
import { z } from "zod";

/** Cheap, fast and good at following descriptions; overridable with STORY_IMAGE_MODEL. */
export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";

const ImagesResponse = z.object({
  data: z
    .array(z.object({ b64_json: z.string().min(1), media_type: z.enum(["image/png", "image/jpeg", "image/webp"]) }))
    .min(1),
  usage: z.object({ cost: z.number().optional() }).optional(),
});

/**
 * How a model is told the picture's shape. Gemini image models take an aspect ratio and a
 * resolution tier; OpenAI's take pixel sizes (and reject the others).
 */
export type Sizing = "ratio" | "pixels";
const SIZING: Record<Sizing, Record<string, string>> = {
  ratio: { aspect_ratio: "4:3", resolution: "1K" },
  pixels: { size: "1536x1024" },
};

export interface OpenRouterIllustratorOptions {
  readonly model?: string;
  /** Defaults by model family: pixels for openai/*, ratio otherwise. */
  readonly sizing?: Sizing;
  /** Test seam: point at a fake OpenRouter API. */
  readonly baseURL?: string;
}

export class OpenRouterIllustrator implements Illustrator {
  readonly model: string;
  private readonly baseURL: string;
  private readonly sizing: Sizing;

  constructor(
    private readonly apiKey: string,
    private readonly log: Logger,
    options: OpenRouterIllustratorOptions = {},
  ) {
    this.model = options.model ?? DEFAULT_IMAGE_MODEL;
    this.sizing = options.sizing ?? (this.model.startsWith("openai/") ? "pixels" : "ratio");
    this.baseURL = options.baseURL ?? "https://openrouter.ai/api/v1";
  }

  async draw(request: {
    readonly prompt: string;
    readonly references?: readonly ReferencePicture[] | undefined;
    readonly signal?: AbortSignal | undefined;
  }): Promise<{
    readonly image: Uint8Array;
    readonly type: ImageType;
  }> {
    const started = performance.now();
    const response = await fetch(`${this.baseURL}/images`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "x-title": "Storytime" },
      // A landscape page picture at about 1K is plenty for a tablet screen. (The image store re-encodes to a
      // small JPEG: gemini-3.1-flash-image ignores output_format and returns PNG.)
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        n: 1,
        ...SIZING[this.sizing],
        // Earlier pictures to copy characters from, so a story looks like one book.
        ...(request.references === undefined || request.references.length === 0
          ? {}
          : {
              input_references: request.references.map((ref) => ({
                type: "image_url",
                image_url: { url: `data:${ref.type};base64,${Buffer.from(ref.image).toString("base64")}` },
              })),
            }),
      }),
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
