# Storytime

Your child speaks a story idea, answers a question or two, picks from their characters' voices, approves the plan, then hears page 1 performed by a narrator and character voices.

## Run it (two terminals)

```bash
# 1. API server (http://localhost:8787). First start designs the narrator voice (~30s, once).
pnpm --filter @storytime/server start

# 2. The app in the browser (Chrome recommended), then open the URL it prints.
cd packages/client && npx expo start --web
```

Keys live in `.env` (see `.env.example`): `GEMINI_API_KEY` (Tier 1 project), `OPENROUTER_API_KEY`, and the LangSmith settings.
The project `.env` overrides anything exported in your shell.

**Faster but slightly plainer writing:** add `STORY_MODEL_CREATIVE=openai/gpt-6-luna` to `.env` (the default is `openai/gpt-6-luna-pro`).

## What to expect

| Step | Typical wait |
|---|---|
| Idea → characters appear | ~12s |
| Idea → outline to approve (voices + page 1 are prepared meanwhile) | ~60s |
| "Yes!" → first line plays | ~6s |
| Cost per story (LLM + ~2 min of audio + voice design) | a few pence |

## Handy commands

- `pnpm check`: typecheck, lint and tests.
- `node_modules/.bin/tsx packages/server/scripts/e2e.ts "idea"`: plays one whole story through the API with timings (costs pennies).
- LangSmith (project `storytime-dev`) shows each story as one thread: every LLM call, voice design and TTS line.
- Server logs are structured JSON (pino). Set `LOG_PRETTY=false` for raw output.

## Privacy

First names only. Recordings are transcribed in memory and never stored. Character voices are designed, never cloned.
