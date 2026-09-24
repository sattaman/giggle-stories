// Loads storytime/.env and lets it WIN over variables already set in the shell.
//
// Node's --env-file / process.loadEnvFile never override existing variables, so a
// GEMINI_API_KEY exported in ~/.zshenv silently shadowed the project key (2026-09-24:
// a free-tier key from another project was used while .env held the paid one).
// For this project the project's own .env is the source of truth.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

const path = join(import.meta.dirname, "..", "..", "..", ".env");

let contents: string | undefined;
try {
  contents = readFileSync(path, "utf8");
} catch {
  contents = undefined; // No .env: fall back to the shell environment.
}

if (contents !== undefined) {
  for (const [key, value] of Object.entries(parseEnv(contents))) {
    const existing = process.env[key];
    if (existing !== undefined && existing !== value) {
      console.warn(`env: ${key} from .env overrides the value set in your shell`);
    }
    process.env[key] = value;
  }
}
