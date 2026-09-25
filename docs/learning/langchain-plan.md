# Learning LangChain, LangGraph and LangSmith through Storytime

**Goal:** close the gap between "it works" and "I understand why, can debug it, and can prove it's right".
Each step uses *our* code, ends in something you ran or wrote yourself, and makes the app more testable.

## 1. Where LangChain lives in Storytime (small on purpose)

| Layer | File | Library pieces | What to understand |
|---|---|---|---|
| Flow | `packages/app/src/graph/story-graph.ts` | LangGraph `StateGraph`, `StateSchema`, conditional + join edges, `interrupt`, `Command` | State, supersteps, routing, human-in-the-loop, re-execution on resume |
| Running it | `packages/server/src/story-service.ts` | `invoke`, `Command({resume})`, `getState`, `configurable.thread_id`, `context` | Threads, checkpoints, resuming, dependency injection |
| Persistence | `packages/server/src/main.ts` | `SqliteSaver` | What a checkpoint contains; history; time travel |
| LLM | `packages/adapters/src/openrouter/structured-model.ts` | `ChatOpenRouter`, `withStructuredOutput`, messages | Structured-output methods, parsing failures, retries |
| Tracing | `packages/adapters/src/tracing.ts` + auto-tracing | LangSmith `traceable`, threads, metadata | Reading a run tree; linking a story to its trace |

Everything else (prompts, domain, TTS, HTTP, UI) is plain TypeScript behind ports. This is deliberate: LangChain is
something we can swap or test around, not something the whole app depends on.

## 2. Testability ladder: what we have, what's missing

| Level | What it proves | How (LangChain pattern) | Status |
|---|---|---|---|
| L0 Domain rules | Name matching, invariants, schemas | Plain unit tests | ✅ 11 tests |
| L1 **Single node** | One step's logic in isolation (e.g. recast keeps voices) | `graph.nodes["recast"].invoke(state, { context })` with fake ports | ❌ missing, next to add |
| L2 Graph routing and pauses | Question → pause → resume → outline loop → perform | Fake ports + `MemorySaver`, `isInterrupted`, `Command({resume})` | ✅ 7 tests |
| L2b **Time travel** | Start mid-flow, e.g. at outline review, without replaying earlier steps | `updateState(config, values, asNode)`, then `invoke(null, …)`, `getStateHistory` | ❌ missing |
| L3 **Adapter contracts** | LLM adapter parsing and retry; the TTS fallback chain | LangChain `fakeModel()` / `FakeListChatModel`; a fake Gemini client | ❌ missing (the riskiest untested code) |
| L4 **Record and replay** | The full text pipeline with *real* LLM outputs, deterministic, free | A `RecordingStructuredModel` decorator saves outputs as fixtures; `ReplayStructuredModel` plays them back in tests | ❌ missing, high value |
| L5 **LangSmith evals** | Story *quality*: coherence, humour, age fit, the child's ideas kept | Dataset of ~15 ideas → text-only run (fake TTS) → code evaluators (invariants) + LLM judge (`openevals`), via `langsmith/vitest` | ❌ missing |
| L6 Live feedback | What actually delights her | 😂 button → LangSmith feedback (presigned token); annotation queue for your ratings | ❌ later |

L4 and L5 are where "robustness" really comes from for an LLM app: they catch prompt regressions, which code review can't.

## 3. Best-practice gaps (from the current LangGraph.js/LangSmith docs, see docs/research/)

| Area | Today | Idiomatic option | Learn / decide |
|---|---|---|---|
| Parallel voices | `Promise.all` inside `designVoices` | **`Send` API** (map-reduce: one branch per character) | Fan-out/fan-in; per-branch retries and tracing |
| Retries | Hand-rolled in adapters + one parse retry | Node `retryPolicy` for transient errors | Where retries belong (adapter vs. node) |
| Progress to the client | In-memory map + polling | `streamMode: ["updates","custom"]` + `config.writer` (SSE later) | Streaming modes; whether polling is fine for a POC |
| Studio | Not set up | `langgraph.json` + a dev graph with fake/real wiring | Visual debugging, breakpoints, forking |
| Subgraphs | One flat graph | Casting (cast → voices → hellos) as a subgraph | Composition; testing a subgraph alone |
| Durability | Default | `durability: "sync"` where resume correctness matters | Checkpoint timing |
| Prompts | In the repo | LangSmith Playground for iterating; repo stays the source of truth | Prompt iteration loop with traces |
| Evals | None | Datasets + experiments + pairwise (Luna vs. Luna Pro) | Measuring instead of guessing |

## 4. Proposed sequence (each ~1 short session: understand → do → keep the result)

1. **See the graph.** Export the Mermaid diagram from code, set up **LangGraph Studio** (`langgraph.json`, dev wiring with fake ports), then step through a story: pause at the question, resume, fork from the outline checkpoint.
   *Keep:* `langgraph.json`, the diagram in docs.
2. **Checkpoints and time travel.** Inspect a real story's history (`getStateHistory`), see exactly what's saved per step, and prove the "resumed node re-runs" rule with a test.
   *Keep:* L2b tests that start at outline review.
3. **Debugging with LangSmith.** Take one real story thread and trace a slow step and a failed call; link `storyId` → thread → server logs. Practise on the failures we hit (oneOf, `title`, the join).
   *Keep:* a short "how to debug a story" runbook.
4. **Node-level tests (L1) + the LLM adapter with a fake model (L3).**
   *Keep:* tests for recast, voice picking, and structured-output retry.
5. **Record and replay (L4).** Record 3 real runs once, then replay them in tests for free, forever.
   *Keep:* the fixtures plus a replay test of the whole text pipeline.
6. **Evals (L5).** Build a dataset from real ideas (anonymised) with a text-only experiment, invariant evaluators and an LLM judge. Compare Luna vs. Luna Pro pairwise.
   *Keep:* `pnpm eval`, a baseline score.
7. **Idioms refactor, one at a time:** `Send` for voices, `retryPolicy`, streaming progress. Each with tests (L1–L4) protecting it.
8. **Then the targeted reviews:** by now L1–L5 cover most risk, so Fable gets only the leftovers (concurrency in the runner, client audio lifecycle), and Astra reviews the design with you able to judge its answers.

## 5. Cost notes
- Steps 1–4 and 7 cost nothing (fakes, local Studio).
- Step 5 costs pennies once (recording).
- Step 6 costs pennies per experiment (LLM only, **no TTS**, so it doesn't touch the voice quota).
