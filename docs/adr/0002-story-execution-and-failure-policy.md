# ADR 0002: Story execution, recovery and retry ownership

**Date:** 2026-09-26 · **Status:** accepted

## Context

A story runs as a LangGraph thread (`thread_id` = story id) checkpointed to SQLite. The
Fastify server's `GraphStoryService` starts each step with a background `invoke` and keeps
"busy", the current stage, errors and partly performed audio in a process-local map.

Tests (`packages/server/test/story-service.test.ts`,
`packages/adapters/test/*-contract.test.ts`) establish the current behaviour:

- **Overlapping replies are safe in one process.** Of two simultaneous approvals, one
  starts the run and the other gets 409. A repeated approval after the story has finished is
  rejected and re-runs nothing.
- **A failed run is a dead end.** The view shows a friendly error, but the checkpoint still
  has the failed node due, and no API resumes it. The child has to start again.
- **A restart turns every unfinished run into "This story got interrupted"**, even though the
  checkpoint holds all the work so far and could simply continue.
- **If the first checkpoint write fails, the story is lost.** It stays in `stories.jsonl`,
  and the library skips it silently.
- **Retries are layered.** OpenRouter: SDK ×4 × one corrective retry, and writer
  corrections ×2 on `cast` and `writePage`. Gemini: our loop, up to 5 attempts per model,
  with model fallback on daily quota. The graph has no retry policy.

## Decision

### 1. Durable results, durable run status, transient progress

- **Story results** stay in checkpoints (unchanged).
- **Run status** becomes durable: a small `runs` table in the checkpoint SQLite file, keyed by
  story id, holding `running | failed`, an error code and `updatedAt`. It's written when a run
  starts and when it fails, and cleared when the run pauses or finishes.
- **Progress** (stage, message, audio of lines finished so far) stays transient. Losing it only
  costs the progress display, and audio is persisted separately in task 9.

### 2. Restart and retry policy

| Situation after restart or failure | Action |
| --- | --- |
| Waiting at an interrupt | Nothing. It waits for the child. |
| `running` when the process died | Resume it automatically at startup with `invoke(null)`, **once**. If it fails again, mark it `failed`. |
| `failed` | No automatic retry. The view offers **"Try again"**, and a new `POST /v1/stories/:id/retry` resumes it with `invoke(null)`, which re-runs only the failed node. |
| Never checkpointed | Remove it from the index, or show it as failed. |

Automatic resumes are limited to one per story per process start, so a story that crashes
the server can't loop. Resuming `performPage` re-synthesises the whole page until task 9
makes segments reusable (about 4–8 extra TTS requests).

### 3. Retry ownership and budgets

- **Transport errors** (429, 5xx, network) are handled by the adapters only. OpenRouter keeps
  SDK retries (`maxRetries: 3`). Gemini keeps its own loop, because it has to tell per-minute
  limits (wait) from daily quota (switch model), which the SDK can't do.
- **Bad model output** is handled by the adapter's one corrective retry, plus the writer's
  domain corrections (missing characters, invalid lines).
- **Graph nodes get no `RetryPolicy`** for now. A node failure reaches the runner, and
  retrying it is the child's choice ("Try again"). Node retries come back only after task 9
  splits expensive nodes, and only for classified transient errors.
- **Budgets**, enforced later with an `AbortSignal` per run: one model call makes at most
  8 HTTP requests; one TTS line makes at most 5 attempts per model; a whole run step times out
  after 3 minutes.

### 4. Operation identities

- **Characters:** the character id; a recast adds the revision round (`voice-<id>-r<N>`,
  as today).
- **Scripts:** page number plus revision (`answers.length` at drafting time).
- **Audio segments:** today `page-<n>-<index>`. Task 9 adds the script revision to the key, so
  reused audio can't come from an older script.

### 5. Checkpoints from older graph shapes

- **Finished stories** only need state values, so they're unaffected by changes to the graph.
- **Waiting or unfinished stories** refer to pending node names. Keep node names stable.
  When one has to change, keep the old name routing to the new node for a release, or show
  those stories as interrupted with a "Try again".
- **State fields** stay additive with defaults, as `view.ts` already does for old characters.
- **Development** uses `data/dev/`, never `data/checkpoints.sqlite`.

### 6. Execution owner

**Keep the Fastify runner** for the POC and family use: one process, SQLite, recovery as above.
**Reconsider LangGraph Agent Server** when hosting for several accounts (`docs/hosting-plan.md`).
It brings durable runs, a task queue, retries and streaming, but also its own deployment,
persistence and auth model. Building items 1–2 is small and doesn't block that move, because
the graph and ports stay the same.

### 7. Checkpoint durability

Runs use `durability: "sync"`: each step's checkpoint is saved before the next step starts.
With the default `"async"`, it's written in the background while the next step runs, so a
crash could lose the last finished step and repeat its paid work on recovery. The cost is one
SQLite write per superstep on the run's critical path, which is negligible next to model and
TTS calls.

(An earlier draft blamed `"async"` for stories briefly showing as interrupted. The real cause
was `view()` reading the checkpoint before the in-memory run state; it now reads run state
first. A test covers it.)

## Implementation

- `packages/server/src/run-store.ts`: `SqliteRunStore`, a `story_runs` table in the
  checkpoint database.
- `GraphStoryService`: `retry()`, `recover()` (called at startup), and `canRetry` on the view.
- `POST /v1/stories/:id/retry`. The client's "Try again" carries on a story when
  `canRetry` is true and offers a new story otherwise.

## Consequences

- One small table and a startup reconciliation step.
- Unfinished stories survive restarts instead of being thrown away.
- Paid work that finished before a failure isn't repeated: each provider call is a LangGraph
  `task`, whose result is checkpointed when it completes (`packages/app/src/graph/durable.ts`).
  A call that was in flight when the process died is repeated. That window can't be closed,
  because saving a result and paying for it can't be one atomic step.
