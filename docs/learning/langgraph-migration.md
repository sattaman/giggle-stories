# LangGraph migration: review and learning sequence

Reviewed 2026-09-25 against the repository and current official JavaScript documentation.
This is a proposed implementation sequence; runtime changes have not been made.

See the [implementation task list](langgraph-tasks.md) for ordered tasks, learning exercises
and completion criteria.

## Assessment

The existing learning plan is a good foundation. Storytime already uses LangGraph for its
central workflow, including typed state, dependency injection, interrupts, joins and SQLite
checkpoints. Keep the domain, API and provider ports independent of the framework. The useful
migration is to make concurrency, recovery and execution observable through the graph.

The main correction: replacing the live map with a stream does not make deployment robust.
Streaming delivers events; persistence saves results; a runner owns and resumes work. These
are separate responsibilities. Postgres alone does not supply background execution either.

## Findings from the code

- `packages/server/src/story-service.ts`: execution is a background `invoke`; busy status,
  errors and partial audio results live in a process-local map. There is no startup recovery.
  `packages/server/src/view.ts` explicitly turns an unfinished, idle story into an error.
- `packages/app/src/graph/story-graph.ts`: separating interrupt nodes from side effects is
  correct, but crashes and retries can still repeat work within an unfinished node.
  `performPage` only returns its durable performance update after the whole page finishes.
  `understand` and `recast` also contain several independently expensive operations.
- `designVoices` and `recast` use `Promise.all`. `Send` would expose per-character work to
  LangGraph, but needs reducers, deterministic ordering and an explicit join strategy.
- The OpenRouter adapter already configures three SDK retries plus a corrective parsing
  attempt. Gemini has its own transient retry and quota fallback logic. Adding blanket node
  retries would multiply attempts and potentially repeat successful calls inside a node.
- The existing graph tests cover useful routes, including revisions. They do not establish
  process-restart recovery, concurrent reply handling or safe partial-work reuse.

These are design observations, not a completed backend or privacy audit.

## Revised sequence

Each slice should include a short explanation, a hands-on exercise, a focused verification
and a small reviewable change. Do not bundle all eight slices into one refactor.

| Slice | Implementation and learning exercise | Acceptance evidence |
| --- | --- | --- |
| 1. See execution | Export Mermaid from the actual builder; add fake-only Studio wiring. Predict the next nodes, run, inspect the state and interrupt. Use isolated data and tracing off by default. | Fake story reaches both pauses and completion without provider credentials. |
| 2. Understand persistence | Inspect checkpoint history, fork at outline review, resume into revision. Test individual nodes for logic and whole graphs for scheduling. | SQLite close/reopen test at a pause; resuming approval does not repeat completed casting or writing; fork leaves the original branch intact. |
| 3. Establish failure contracts | Cover runner failures and adapter parsing, quota, fallback and retry behaviour using injected fakes. Define restart policy and retry ownership before implementing recovery. | Controlled failures distinguish retryable, permanent and intentional text-only fallback outcomes; simultaneous replies cannot both own execution. |
| 4. Learn dynamic fan-out | Replace initial voice `Promise.all` with one `Send` branch per character. Allocate library voices before dispatch; merge results by character and revision, preserving cast order. | Out-of-order completion, multiple characters, an empty work list, branch failure and revision do not duplicate or retain stale voices; outline review waits for voices and drafting. |
| 5. Make recovery safe | Give expensive work smaller checkpoint boundaries or persisted task results. Persist segment results by story, script revision and segment index. Define reuse/invalidation and restart ownership; explicitly choose durability mode. | Stop after partial synthesis, reopen storage and resume; committed results are reused, changed scripts invalidate old audio, permanent failure remains visible after restart. |
| 6. Stream progress | Consume graph updates/custom events through a typed server-side projection. Persist authoritative status/results; retain polling first and add SSE only when useful. Keep the producer independent of a browser connection. | Disconnect/reconnect reconstructs the correct view; lost or repeated events do not lose audio or duplicate work; partial audio remains available promptly. |
| 7. Evaluate quality | Add versioned synthetic record/replay fixtures and a small text-only dataset. Key replay by task/input rather than global call order; validate outputs and reject missing recordings. | Offline regression checks are deterministic; deliberate prompt changes trigger useful failures. Live comparisons use explicit budgets and human-calibrated rubrics. |
| 8. Prepare deployment | Choose Fastify plus a durable runner versus Agent Server. Then add authentication, ownership, shared persistence/storage, retention and operational recovery appropriate to that choice. | Two workers cannot execute the same story concurrently; cross-account access is denied; restart recovery and deletion work end-to-end. |

Keep the quality track moving alongside graph work; L4/L5 are not prerequisites for learning
`Send` or streaming. Recorded responses exercise orchestration and contracts, but cannot
predict what a live model will produce under a changed prompt. Evals are evidence of quality,
not a substitute for concurrency and failure tests.

## Design decisions to make explicit

1. **State versus events.** Store story results and recoverable execution status durably.
   Treat transient messages as optional presentation. Custom events alone are not checkpoints.
2. **Replay semantics.** A crash between a provider response and its saved result can still
   repeat a paid request. Stable artifact names prevent duplicate files, not duplicate billing.
   Document this window; use provider idempotency where supported. Synchronous checkpointing
   does not create an atomic transaction with the provider.
3. **Retry ownership.** Keep provider-specific quota/fallback logic in adapters. Use narrowly
   classified node retries only after establishing safe operation boundaries and a total attempt
   budget. A caught error returned as a fallback is a successful node from the graph's perspective.
4. **Parallel state.** Do not let every branch replace `cast`. Use a dedicated result channel
   with an explicit reducer and a deterministic assembly step. Bound concurrency and handle
   zero branches. Test scheduling because changing branch depth changes superstep behaviour.
5. **Subgraphs.** Introduce one when it clarifies a stable responsibility. A voice preparation
   subgraph can hide fan-out depth while exposing a single completion boundary to the parent.
   Preserve overlap with outline drafting; measure the critical path instead of assuming speedup.
6. **Existing checkpoints.** Node names, state schema and pending work are compatibility
   concerns. Use separate development databases and decide how old stories are completed,
   migrated or version-routed before deploying a changed topology.
7. **Data use.** Use synthetic ideas for fixtures, Studio and initial evaluations. Review real
   data flows before uploading child-derived examples or opening the app to other families.
   Auth must cover story and audio access as well as future event streams. A3 is useful input,
   but is not a substitute for checking what this code actually sends and stores.

The immediate learning milestone is slices 1–2, followed by one `Send` exercise protected by
the relevant failure tests. Auth and production Postgres need not complicate that local exercise.

## Official references

- [Graph API: Send, state and routing](https://docs.langchain.com/oss/javascript/langgraph/graph-api)
- [Testing nodes and partial execution](https://docs.langchain.com/oss/javascript/langgraph/test)
- [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [Fault tolerance and retry policies](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance)
- [Streaming modes](https://docs.langchain.com/oss/javascript/langgraph/streaming)
- [Local development and Studio](https://docs.langchain.com/langsmith/local-dev-testing)

Check examples against the pinned `@langchain/langgraph` 1.4.17 types before implementation.
The current streaming documentation also recommends a newer event-streaming interface for
new applications; evaluate its JavaScript support against this installation rather than
blindly translating Python examples or adding a dependency upgrade to this migration.
