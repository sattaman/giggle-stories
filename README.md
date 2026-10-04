# Storytime (giggle-stories)

**A funny, voice-performed story generator for children.** A child *says* a story idea out loud. The app asks one or two quick questions and casts the characters, each with their own designed voice. It proposes a plan the child can change by talking, then performs the page aloud: a narrator plus a distinct voice for every character, and a picture-book illustration of the moment they're hearing.

Built as a real product for one very demanding user (success = she laughs and asks for another). It's also a portfolio piece showing how to build an **agentic, multi-provider AI workflow that's durable, observable and tested**, rather than a prompt in a loop.

```text
 "A hamster chef who's scared of spoons!"
        │  speech → text (Gemini 3.5 Transcribe)
        ▼
 understand the idea ── ask 0–2 questions ⏸ (only when the answer could change the story)
        ▼
 cast characters ─┬─ give each a voice (shared voice library, or a newly designed voice)
                  └─ plan the story → write page 1
        ▼
 child reviews the plan ⏸ ── "make Amber less grown-up" → recast, re-voice, redraft
        ▼  "Yes!"
 perform page 1, line by line (first line plays after ~6 s)  ┐ in parallel
 paint the picture for that page (~12 s)                     ┘
```

## Tech at a glance

| Area | Technology | How it's used |
| --- | --- | --- |
| Workflow | **LangGraph.js 1.4** | The story is a `StateGraph` with typed state, `interrupt()` pauses for the child, `Command` routing, a deferred join (`defer: true`) and parallel branches. It's checkpointed to SQLite, so a story survives restarts. |
| Durable side effects | LangGraph **`task()`** | Every paid call (LLM, TTS, voice design, image) is a durable task. A retried or resumed step restores finished calls instead of paying twice. |
| Streaming | LangGraph custom stream | Nodes emit typed progress with `config.writer`; the server streams it into the live view, so audio starts before the page finishes. |
| Reliability | Node timeouts, `RunControl`, `durability: "sync"` | Hung provider calls are cancelled with `AbortSignal`, SIGTERM drains runs cleanly, and recovery resumes interrupted stories (ADR 0002). |
| LLM | **LangChain** `ChatOpenRouter` → **GPT-6 Luna / Luna Pro** | `withStructuredOutput` (function calling, `includeRaw`) with zod schemas. The adapter validates the raw tool call, re-asks once with the zod issues, detects truncation and logs token usage. |
| Speech | **Gemini 3.8 Flash TTS** (+ **Flash-Lite TTS** fallback) | Expressive, style-directed lines per character. Quota-aware retries, with automatic fallback to the Lite model and then to built-in voices when a daily quota runs out. |
| Voices | **Gemini Voice Design** | A shared library of 18 designed character voices (4 girls, 4 boys, parents, grandparents, villains, creatures, robot), plus per-story designs. Descriptions name the sound, never an age. |
| Listening | **Gemini 3.5 Transcribe** | The child's spoken idea and answers. Recordings are transcribed in memory and never stored. |
| Pictures | **Gemini 3.1 Flash Lite Image** via OpenRouter's Images API | One picture-book illustration per page, drawn from the page the child hears, and stored as a 1024 px JPEG. Chosen by LangSmith evals (`packages/evals`): the most consistent across pages, at half the price. Swappable by config. |
| Observability | **LangSmith** (EU) | Each story is one LangSmith thread: every graph node, LLM call, voice design and TTS line, with its real model and cost. Spoken answers join their story's thread. |
| API | Fastify, zod | A small `/v1` API. Every boundary is validated (HTTP, env, LLM output, SDK results, even checkpoints). |
| App | Expo / React Native (web first) | A child-first UI: big buttons, narration, speaking-character highlights and "Try again" that carries a story on. |
| Quality | TypeScript 7 + 6, strict ESLint, Vitest, Turborepo, GitHub Actions, gitleaks | No `any`, no `as`, no `!`. About 150 tests, run in CI with a secret scan. One command brings the whole stack up. |

## Engineering highlights

- **Ports and adapters.** The story engine (`packages/app`) only knows interfaces: `StructuredModel`, `SpeechSynthesizer`, `VoiceDesigner`, `Illustrator`… Swapping Gemini TTS or the image model means a new adapter plus one line in the composition root, not a rewrite.
- **Contract tests against real SDKs.** The Gemini and OpenRouter adapters are tested with the *real* `@google/genai` SDK and LangChain's `ChatOpenRouter` pointed at local fake HTTP servers. They cover retries, quota fallback, parse failures, truncation and cancellation, with no network and no cost.
- **Durability you can test.** Whole-graph tests stall a paid call mid-step, let it time out, retry, and assert that *only* that call is repeated. Other tests close and reopen SQLite at a pause, fork a checkpoint, and drain a run on shutdown.
- **Failure is part of the design.** A voice can't be designed → rewrite the description → stock voice → catalogue voice. A picture fails → the story carries on. A story stops mid-way → "Try again" re-runs only the failed step.
- **Child-safe by default.** First names only, no stored recordings, no voice cloning. Model-written SVG is sanitised and served under a strict Content-Security-Policy, and there's a switch to hide trace inputs and outputs for other families.
- **Decisions are written down.** See [ADR 0001](docs/adr/0001-typescript-toolchain.md) (toolchain), [ADR 0002](docs/adr/0002-story-execution-and-failure-policy.md) (execution, recovery, retries), [the illustration design](docs/design/page-illustration.md) and [story-craft research](docs/research/story-craft.md).

## Run it

```bash
pnpm install
pnpm dev
```

`pnpm dev` uses [Turborepo](https://turborepo.com) to run each app's `dev` task side by side: the API on http://localhost:8787 (restarts when its code changes) and the web app on **http://localhost:8082**. Ctrl-C stops both, and the API finishes its current story step before exiting.

For a phone or iPad on the same Wi-Fi network, set the API address before starting, then open the Expo URL on the device, replacing `localhost` with your Mac's IP:

```bash
EXPO_PUBLIC_API_URL=http://<your-mac-ip>:8787 pnpm dev
```

Keys live in `.env` (see `.env.example`): `GEMINI_API_KEY` (Tier 1 project), `OPENROUTER_API_KEY`, and the LangSmith settings (EU endpoint). The project `.env` overrides anything exported in your shell.

Useful settings:

- `STORY_PICTURES=painted|animated|both|none`. Painted is the default. `animated` is an experimental SVG scene drawn by the text model.
- `STORY_MODEL_CREATIVE=openai/gpt-6-luna` gives faster but slightly plainer writing (the default is `openai/gpt-6-luna-pro`).
- `STORY_IMAGE_MODEL` accepts any OpenRouter image model.

## What to expect

| Step | Typical wait |
|---|---|
| Idea → first question | ~10 s |
| Answer → plan to approve (voices and page 1 are prepared meanwhile) | ~45 s |
| "Yes!" → first line plays | ~6 s |
| "Yes!" → picture appears | ~12 s |
| Cost per story | about 4p: ~2.5p picture, the rest LLM and speech |

## Handy commands

- `pnpm check`: typecheck (TS 7 and 6), lint and tests. CI runs the same command.
- `node_modules/.bin/tsx packages/server/scripts/e2e.ts "idea"` plays one whole story through the API with timings (costs pennies).
- `DATA_DIR=./data pnpm --filter @storytime/server audition` designs any missing library voices and writes a page to compare the young voices.
- `pnpm --filter @storytime/app studio` opens the story graph in LangGraph Studio with synthetic, credential-free dependencies.
- LangSmith (project `storytime-dev`) shows each story as one thread.

## Layout

```text
packages/
  domain/    zod schemas, invariants and the /v1 API contract (shared with the app)
  app/       ports, story writer prompts, and the LangGraph workflow
  adapters/  OpenRouter (LLM, images), Gemini (TTS, voice design, transcription), storage, LangSmith tracing
  server/    Fastify API, composition root, story runner and recovery
  client/    Expo child UI
```

## Privacy

First names only. Recordings are transcribed in memory and never stored. Character voices are designed, never cloned. Before anyone else's child uses the app, provider terms for child-facing use need checking, and trace inputs and outputs should be hidden (`LANGSMITH_HIDE_INPUTS/OUTPUTS=true`).
