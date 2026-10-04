// Configuration: storytime/.env is loaded and WINS over the shell environment
// (~/.zshenv exports a different GEMINI_API_KEY — see CLAUDE.md), then validated.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

export function loadDotEnv(path = join(REPO_ROOT, ".env")): string[] {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const overridden: string[] = [];
  for (const [key, value] of Object.entries(parseEnv(contents))) {
    if (process.env[key] !== undefined && process.env[key] !== value) overridden.push(key);
    process.env[key] = value;
  }
  return overridden;
}

const Config = z.object({
  GEMINI_API_KEY: z.string().min(10),
  OPENROUTER_API_KEY: z.string().min(10),
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default("0.0.0.0"),
  PUBLIC_URL: z.url().optional(),
  DATA_DIR: z.string().default(join(REPO_ROOT, "data")),
  STORY_MODEL_FAST: z.string().optional(),
  STORY_MODEL_CREATIVE: z.string().optional(),
  /** Any OpenRouter image model, e.g. google/gemini-3-pro-image; default in the adapter. */
  STORY_IMAGE_MODEL: z.string().optional(),
  /** Any OpenRouter text model for animated SVG scenes; default in the adapter. */
  STORY_SCENE_MODEL: z.string().optional(),
  /**
   * Which pictures each page gets: painted (~2.5p), animated SVG (~0.5p), both (for comparing), or
   * none. Painted by default: in the first trial the model's hand-drawn SVG people were crude next
   * to the painting, and its animations too small to notice.
   */
  STORY_PICTURES: z.enum(["both", "painted", "animated", "none"]).default("painted"),
  LOG_PRETTY: z.enum(["true", "false"]).default("true"),
});
export type Config = z.infer<typeof Config> & { readonly publicUrl: string };

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = Config.parse(env);
  return { ...config, publicUrl: config.PUBLIC_URL ?? `http://localhost:${String(config.PORT)}` };
}
