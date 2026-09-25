# Review plan: Storytime POC (2026-09-25)

The POC was built quickly over one night and one morning: about 5.8k lines of source, 29 commits, most of it written by one agent plus two sub-agents. Tests and strict lint pass, but no second pair of eyes has reviewed it.

**Two reviewers, split by strength:**
- **Fable (Claude Fable 5.1, in-repo, full code access):** line-level correctness. It reads the actual code, runs tests, and proves or disproves bugs.
- **Astra (external second opinion, no repo access):** design-level critique from an independent model. It gets self-contained prompts describing the design; **no keys, no child data, no transcripts.**

## What needs reviewing, by risk

| # | Area | Risk | Why | Reviewer |
|---|---|---|---|---|
| 1 | LangGraph story graph (`packages/app/src/graph/story-graph.ts`) | **High** | Interrupt/resume re-execution, the join edge (`designVoices` ∥ `planOutline→draftPage`), the revise → recast → redraft loop, state growth, side effects in nodes | Fable (code) + Astra (idioms) |
| 2 | Story runner (`packages/server/src/story-service.ts`, `view.ts`) | **High** | Background runs, in-memory `live` progress vs. checkpoints, busy/409 races, restart mid-run, index ↔ checkpoint consistency, legacy-data upgrade | Fable |
| 3 | Gemini adapter (`packages/adapters/src/gemini/gemini.ts`) | **High** | Five-model TTS fallback chain, daily-quota detection by message text, retry/backoff, per-process `exhaustedUntil`, legacy `generateContent` path | Fable (code) + Astra (strategy) |
| 4 | Client audio and state (`packages/client/src/story/*`, `src/audio/*`) | **High** | Playback and clip-sequence machines, expo-audio lifecycle on web, autoplay heuristics, the recording fix, polling and backoff | Fable |
| 5 | Story prompts (`packages/app/src/writer/prompts.ts`) | **High** (product) | Humour, coherence, age bands, speech-to-text caution, voice-description rules, gender handling | Astra (craft) + Fable (does the code honour them?) |
| 6 | Privacy and safety | Medium → High before sharing | Children's ideas in logs and LangSmith (US region), no auth, open CORS, audio served by guessable URL, retention, UK Children's Code | Astra (policy) + Fable (what actually leaks) |
| 7 | Architecture and hexagonal boundaries | Medium | Ports vs. adapters, domain purity (shared with mobile), composition root, where LangGraph sits | Astra |
| 8 | Test gaps | Medium | No tests for the TTS fallback chain, narration caching, recast with the library, or the HTTP polling client | Fable |
| 9 | Type-safety escape hatches | Low | `pnpm patch`es, shims, client `skipLibCheck` (ADR 0001) | Fable (quick) |

**Suggested order:** Fable prompts F1 and F2 first (correctness before polish), Astra prompts A1–A3 in parallel (they need no repo), then F3 (tests) to lock in fixes.

---

## Fable prompts (run in the repo, e.g. an Agent with `model: "fable"`)

### F1: Backend correctness review
```
You are reviewing the Storytime backend at /Users/thomas.sanderson/Personal/storytime (read CLAUDE.md first).
Focus: packages/app/src/graph/story-graph.ts, packages/server/src/story-service.ts, packages/server/src/view.ts,
packages/server/src/narration.ts, packages/adapters/src/gemini/gemini.ts, packages/adapters/src/openrouter/structured-model.ts.

Find real bugs, not style. For each suspected issue, PROVE it (write a failing vitest test or a precise trace
through the code with line numbers) or drop it. Specifically check:
1. LangGraph: can any node with side effects re-run on resume (duplicate LLM/TTS spend, duplicate audio)?
   Does the join edge ["designVoices","draftPage"] → reviewOutline behave on revise loops? Can state grow unbounded?
2. Story runner: races between run()/reply()/view(); what happens on server restart mid-step; can the
   in-memory `live` map and the checkpoint disagree so the child sees a wrong status; 409 correctness.
3. Gemini TTS fallback: daily-quota detection by message text ("per day"), exhaustedUntil handling,
   concurrent requests racing past an exhausted model, legacy generateContent path, empty responses,
   retryDelayMs parsing. Any path where a line silently ends up without audio when a model had quota?
4. Voice selection: pickLibraryVoices uniqueness across recast; gender correctness of every fallback path.
5. Error handling: anything that turns an upstream failure into a stuck "working" story.
Do not modify production code. Output: ranked findings (severity, file:line, evidence, minimal fix),
plus any failing tests you wrote under packages/*/test/review-*.test.ts.
```

### F2: Client audio and state review
```
Review the Storytime Expo client at /Users/thomas.sanderson/Personal/storytime/packages/client (read CLAUDE.md).
Focus: src/story/playback.ts, src/story/clip-sequence.ts, src/story/flow.ts, src/story/narration.tsx,
src/audio/*, src/speech/*, src/api/http-story-api.ts, src/app/story/[id].tsx.
Find real bugs: overlapping audio, stuck states (waiting forever, never reaching "finished"), stale events,
leaks (players/timers/intervals not cleaned up on unmount/navigation), autoplay assumptions, recording
start/stop races, polling that never stops or hammers the server, zod validation gaps, and anything that
breaks on iOS/Android (the app must go native later). Prove each finding with a failing node:test test or a
precise trace. Do not modify production code. Output ranked findings with file:line and minimal fixes.
```

### F3: Test-gap pass (after F1/F2 fixes land)
```
In /Users/thomas.sanderson/Personal/storytime, list the highest-value untested behaviour and add tests for the top
items, without changing production code unless a test exposes a bug (then stop and report it). Candidates:
the GeminiSpeech fallback chain with a fake GoogleGenAI (quota → next model, legacy empty response),
Narration caching, recast with the voice library (distinct voices, gender kept), StoryIndex ordering,
the HTTP StoryApi client against a fake fetch, and the outline-review clip sequence.
`pnpm check` must pass. Report what you covered and what still isn't.
```

### F4: Privacy and data-flow audit (in repo)
```
Audit /Users/thomas.sanderson/Personal/storytime for where a child's data goes: the idea text, answers,
transcripts, names and generated stories. Trace it through logs (pino), LangSmith traces (tracing.ts,
LangChain auto-tracing, metadata), the filesystem (data/: checkpoints.sqlite, audio, stories.jsonl), HTTP
responses and CORS, and third parties (OpenRouter, Gemini). Confirm raw recordings are never stored.
Output a data-flow table (what, where, retention, who can read it) and concrete fixes ranked by importance
for (a) a private family POC and (b) sharing with other families. Do not modify code.
```

---

## Astra prompts (self-contained; paste as-is)

### A1: Architecture and LangGraph idioms
```
I'm building a kids' story app (TypeScript, Node 22) as a learning project for LangGraph.js 1.4 and LangSmith.
Flow: the child speaks an idea → speech-to-text → an LLM extracts a brief → decides to ask up to 2 clarifying
questions (graph pauses with interrupt(); the client polls; the answer resumes with Command({resume})) →
cast the characters → in parallel: [pick/design a voice per character] and [plan a 6-beat outline → draft
page 1] → join → pause for outline approval → (changes: revise outline → recast → redraft → pause again) →
perform page 1: TTS per line, 3 concurrent, progress pushed to an in-memory store the client polls.
Hexagonal architecture: domain (zod schemas, shared with the Expo client), app (ports + graph + prompts),
adapters (OpenRouter LLM, Gemini TTS/voice design/STT, fs audio), server (Fastify, background runner,
SQLite checkpointer). Ports are injected via LangGraph's context schema. Side-effecting nodes are never
interrupt nodes, because a resumed node re-runs from the top.

Please critique:
1. Is this idiomatic LangGraph.js 1.x (StateSchema, interrupts, context injection, join edges, checkpointers)?
   What would you change?
2. Running graph steps in the background and letting the client poll a "view" built from the checkpoint
   + an in-memory progress map: is that sound, or should progress be graph state / a stream (custom stream
   mode, SSE)? What about server restarts mid-step?
3. Where should latency work go? (Today: ~60–100s from idea to outline, dominated by LLM outline/page writing
   and per-character TTS; ~5–7s from approval to the first spoken line.)
4. Anything in the hexagonal split that will hurt when adding a native mobile app, multiple pages and evals?
Be concrete; give code-level suggestions where useful.
```

### A2: Story-writing prompt craft
```
Below are the system prompts for an LLM that co-writes funny, read-aloud stories with a child (ages 0–4,
5–8, 9–12). The child's input usually comes from speech-to-text. The stories are performed by a narrator
plus per-character TTS voices (each line has a short acting note). Structured outputs are flat JSON objects.
[PASTE packages/app/src/writer/prompts.ts, the non-sensitive prompt text only]

Please critique like an experienced children's author and prompt engineer:
1. Will these reliably produce stories an 8–12-year-old finds genuinely funny, and simple, joyful ones for 0–4?
   What's missing (e.g. comic structure, running gags across pages, character voice consistency)?
2. Where are the prompts ambiguous or self-contradictory, or likely to make the model over-ask, over-explain or
   be generic?
3. Speech-to-text robustness: what else should the model do with misheard names, restarts and duplicates?
4. Voice-description rules: the voice-design API blocks child-sounding descriptions; is our "state the gender,
   describe the sound, cartoon framing" approach the best workaround, ethically and practically?
5. Propose revised prompt text for the 3 weakest parts, plus 5 evaluation criteria and an LLM-judge rubric
   for automated story-quality evals.
```

### A3: Children's privacy and safety (UK)
```
A UK parent is building a story app for their own child: the child speaks a story idea (they may mention their
own name, siblings, pets, friends and friends' ages), and it's transcribed by a cloud speech API, sent to
cloud LLM/TTS APIs, traced in an observability SaaS (US region), and stored locally (story state, generated
audio). No accounts yet; runs on the parent's laptop. It may later become a mobile app shared with other families.

Please advise:
1. For the private family POC: the minimum sensible safeguards (data minimisation, retention, what not to
   log or trace, provider settings such as training opt-outs and zero-retention options).
2. Before sharing with other families: what the UK Children's Code (Age Appropriate Design Code) and UK GDPR
   require in practice (DPIA, parental consent under 13, defaults, transparency for kids), and the
   architecture changes that implies (accounts, EU/UK data residency, deletion, moderation).
3. Content-safety design for generated stories for ages 0–12: input and output moderation, and how to handle
   a child saying something concerning.
Practical and prioritised, not a legal essay.
```

### A4: TTS quota, cost and latency strategy (optional)
```
A kids' story app voices every line with a cloud TTS model that supports custom-designed voices but has a
100 requests/day limit per model on the entry paid tier; a story needs ~16–25 requests (one per line, plus
character "hello" samples and narrator prompts). We fall back through older models (built-in voices only),
each with its own quota. Designed voices are the magic; built-in ones are a fallback.
What's the best strategy to (a) maximise designed-voice stories per day, (b) cut latency (currently ~5s per
line, lines synthesised 3 at a time), and (c) keep cost trivial? Consider batching lines per request, multi-
speaker requests, caching, pre-synthesising, streaming, merging adjacent lines, and alternative providers.
```

---

## After the reviews
1. Triage findings into must-fix (before the next play session), should-fix and later.
2. Each fix lands with a test (F3 style) and `pnpm check` green.
3. Record decisions (e.g. progress architecture, privacy defaults) as ADRs in `docs/adr/`.
