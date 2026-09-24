# Storytime

A voice-performed, funny story generator for an 8–12-year-old. The child speaks an idea, answers 0–2 spoken questions, approves an outline, then hears page 1 performed by a narrator and designed character voices. The POC succeeds if she laughs and asks for another.

Plan: `docs/plan.md`. Verified API notes: `docs/research/`. Decisions: `docs/adr/`.

## Layout (pnpm workspace, TypeScript, ESM, no build step: packages export `./src/index.ts`)
- `packages/domain`: zod schemas, invariants and the `/v1` API contract (`src/api.ts`). **Platform-neutral** (`types: []`): no Node or DOM APIs, because the Expo app imports it.
- `packages/app`: ports (`src/ports.ts`), the story writer's prompts and logic (`src/writer/`), and the LangGraph graph (`src/graph/story-graph.ts`).
- `packages/adapters`: OpenRouter StructuredModel, Gemini TTS / Voice Design / Transcribe, filesystem AudioStore, LangSmith `traceable` decorators.
- `packages/server`: Fastify `/v1` API, composition root, story runner.
- `packages/client`: Expo (web now, iOS/Android later) child UI.
- `spikes/voice`: Phase 0 voice spike (throwaway).

## Commands
- `pnpm check`: typecheck (TS7 `tsc` + TS6 `tsc6`), ESLint (zero warnings) and all tests. It must pass before committing.
- `pnpm --filter @storytime/<pkg> test`, `… typecheck`.
- `packages/adapters/scripts/live-check.ts`: live LLM smoke test (costs pennies). Run it with `node_modules/.bin/tsx`.

## Rules
- **Strictness:** follow the typescript-setup skill. No `as`, no `!`, no `any`, `skipLibCheck: false`. Validate every boundary with zod (LLM output, SDK results, HTTP, env).
  - Upstream `.d.ts` defects are fixed with `pnpm patch` (`patches/`) or small shims. Record each in ADR 0001.
- **Imports:** relative imports use `.ts` extensions (`allowImportingTsExtensions`).
- **LangGraph:** nodes with side effects (LLM, TTS) must never be interrupt nodes, because a resumed node re-runs from the top. A node can't share a name with a state field.
- **LLM-facing schemas** stay flat objects: no unions/oneOf (Anthropic structured output rejects them). Keep length limits generous.
- **Voice Design blocks child-like voice descriptions** (age, kid, young, tiny, sweet, squeaky…). Describe the sound, or use cartoon framing. Fallback chain: rewrite the description, then a catalogue voice.
- **Env:** `storytime/.env` must override shell env. `~/.zshenv` exports a different, free-tier `GEMINI_API_KEY`.
- **Privacy:** first names only; delete raw recordings after transcription; no voice cloning.
- **LangSmith:** the account is in the US region (`LANGSMITH_ENDPOINT=https://api.smith.langchain.com`), project `storytime-dev`.
