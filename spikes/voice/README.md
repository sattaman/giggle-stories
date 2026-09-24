# Phase 0: voice spike

A throwaway script that answers one question: **do designed Gemini voices plus a funny script make a story feel alive?**

```bash
cp .env.example .env    # add GEMINI_API_KEY (from Google AI Studio)
pnpm spike:voice                           # designs 3 voices, renders "styled" and "plain" versions
pnpm spike:voice --variant styled --play   # plays the result through afplay
```

What it does:
- Designs voices for the narrator, Pip and Sir Reginald from the descriptions in `src/cast.ts`. The voice IDs are cached in `out/voices.json`. Editing a description designs a new voice and deletes the old one.
- Generates each line of `src/scene.ts` with one TTS call (`gemini-3.8-flash-tts`), then joins them into `out/<run>/<variant>/page.wav`.
- Writes `report.json`: per-line latency, total wall time, and token and cost estimates.
- Voice previews are saved to `out/voice-previews/`.

What to listen for (with her):
- Does each character sound "right"?
- Does "styled" beat "plain"?
- Are the jokes landing?
- Is the narrator fun or annoying?

## Tracing (LangSmith)

Set these in `.env`: `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, and `LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com` if your account is in the EU region.

Each run is one trace, and the whole run is grouped as one LangSmith thread via `thread_id`:

```
voice_spike (chain)                 run_id, variant, concurrency
├── design_voice (tool) × n         only for voices not already cached
└── perform_page (chain) × variant
    ├── gemini_tts (llm) × 20       text, style, voice_id → audio_ms, latency_ms, usage_metadata
    └── publish_page (tool)         page WAV attached (play it in the LangSmith UI)
```

Tracing lives in `src/tracing.ts` as wrappers around the Gemini functions. The API key and raw audio bytes are never recorded; only the finished page is uploaded, as an attachment. With `LANGSMITH_TRACING` unset, the wrappers do nothing.
