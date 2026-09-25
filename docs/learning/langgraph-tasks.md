# LangGraph migration task list

New here? Read the [mini guide](guide.md) first.

Status: tasks 1–4 done ([setup, diagram and Studio](studio.md), [checkpoints](checkpoints.md),
[failure contracts](failure-contracts.md)); the rest planned. Companion to [the migration review](langgraph-migration.md)
and [the original learning plan](langchain-plan.md).

## Working agreement

- Keep each numbered task a small, reviewable change; split it further when necessary.
- For each task: explain the concept, predict the behaviour, run a synthetic example,
  inspect the result, then record what was learned.
- Keep domain schemas and client API independent of LangGraph. Preserve current story behaviour.
- Use isolated development data and fake providers by default. Live calls and recordings
  are separate, explicitly budgeted exercises.
- Run focused tests during implementation and `pnpm check` before each code change is committed.
- Check APIs against the pinned JavaScript package types. Avoid incidental dependency upgrades.

## A. Visualise and understand the existing graph

### 1. Establish a reproducible learning environment

- [x] Complete dependency setup in the existing `codex/langgraph-learning` worktree.
- [x] Run `pnpm check` in that worktree and record the baseline.
- [x] Configure separate checkpoint/audio directories and fake dependencies; disable tracing
  by default for exercises. Do not copy real story data or credentials into fixtures.

**Done when:** the documented setup can run synthetic stories without provider credentials.

### 2. Add graph visualisation and Studio wiring

- [x] Export Mermaid from `buildStoryGraph()` and document how to regenerate it.
- [x] Add `langgraph.json` and a development entry point with fake dependencies.
- [x] Document how dependency context and checkpoint ownership work in the Studio runtime.
- [x] Walk through clarification, outline approval, revision and completion.

**Done when:** the diagram reflects the actual graph and the fake Studio workflow reaches
both interrupt types and completion.

**Exercise:** predict which nodes run together and which state each node sees before stepping.

### 3. Add checkpoint and time-travel exercises

- [x] Add checkpoint-history inspection with synthetic data.
- [x] Test closing/reopening SQLite at an interrupt, then resuming with fresh graph dependencies.
- [x] Fork an outline-review checkpoint, revise the fork, and verify the original is unchanged.
- [x] Test that approval does not repeat completed casting, drafting or voice preparation.
- [x] Demonstrate interrupted-node re-execution using a harmless counter in a test fixture.

**Done when:** tests distinguish interrupt resume, failure recovery and deliberate checkpoint
forking; the exercise explains why individual-node tests cannot prove checkpoint behaviour.

## B. Protect behaviour and define failure handling

### 4. Add focused node and adapter contract tests

- [x] Test recast voice preservation, changed-character voice replacement and library uniqueness.
- [x] Test structured-output parsing, corrective retry and permanent provider failure.
- [x] Test TTS transient errors, daily quota exhaustion, fallback order and empty responses.
- [x] Make dependencies injectable where necessary to test these behaviours without live calls.

**Done when:** tests assert outputs and provider attempt counts, including intentional text-only
fallbacks. Bugs found are fixed in separate, focused changes with regression coverage.

### 5. Document execution, retry and compatibility decisions

- [ ] Record an ADR separating persisted story results, run status and transient progress events.
- [ ] Define restart policy: which unfinished runs resume automatically and which await intervention.
- [ ] Assign retry ownership between SDK, adapter and graph; define total attempt/time budgets.
- [ ] Define operation identities for characters, revisions, scripts and audio segments.
- [ ] Define handling of checkpoints created by older graph topologies before renaming nodes.
- [ ] Compare the existing Fastify runner with Agent Server; choose the intended execution owner
  before building substantial recovery infrastructure.

**Done when:** the ADR explains who owns execution, what survives a crash, what may repeat,
how old stories remain usable, and how permanent failures are surfaced.

### 6. Test runner concurrency and failure states

- [ ] Add tests for overlapping replies and stale/repeated approval submissions, including a repeated
  approval after the story has finished (resuming an answered checkpoint replays; see
  [checkpoints](checkpoints.md)).
- [ ] Exercise failures before the first checkpoint and during a later node.
- [ ] Specify expected views for waiting, working, partially performed, failed and completed runs.
- [ ] Cover the story index/checkpoint gap when starting a run fails.

**Done when:** regression tests establish one active execution per story in the supported local
runtime and give every failure a defined, recoverable or terminal outcome.

## C. Move voice concurrency into LangGraph

### 7. Introduce `Send` for initial voice preparation

- [ ] Allocate library voices deterministically before dispatch.
- [ ] Send one character-specific input to each voice worker; cap provider concurrency.
- [ ] Collect results in a dedicated reducer-backed channel, keyed by character and revision.
- [ ] Assemble the cast in its original order and explicitly handle zero dispatched workers.
- [ ] Preserve the join with outline/page drafting; prove it fires once after required work.
- [ ] Test out-of-order completion, partial branch failure and successful-branch reuse on recovery.

**Done when:** multiple characters receive the correct distinct library assignments, no update
is lost, and outline review cannot happen before voice preparation and drafting finish.

**Exercise:** inspect branch state and explain why workers cannot each overwrite the full cast.

### 8. Apply the pattern to recasting; evaluate a subgraph

- [ ] Dispatch only characters requiring new voice preparation and retain unchanged voices.
- [ ] Prevent prior-revision results from leaking into the new cast.
- [ ] Extract voice preparation into a subgraph if it provides a useful shared completion boundary;
  otherwise record why the flat graph is clearer.
- [ ] Test repeated revisions, no changed voices, removed characters and voice failures.

**Done when:** revisions preserve existing behaviour and overlap with drafting is retained where
intended. Compare synthetic timing/traces to detect accidental serialisation.

## D. Make work resumable and progress durable

### 9. Persist expensive work at useful boundaries

- [ ] Split multi-operation nodes or use persisted task results where this prevents unnecessary replay.
- [ ] Persist completed audio segments independently of completion of the entire page.
- [ ] Key audio reuse by story, script revision, segment and synthesis inputs; invalidate changed work.
- [ ] Choose and document checkpoint durability mode based on recovery requirements.
- [ ] Test a crash after some results are saved and before remaining work completes.

**Done when:** reopening storage and resuming reuses committed results and completes the remaining
work. Document the provider-response-before-save window; do not claim exactly-once billing.

### 10. Implement recovery and bounded retries

- [ ] Implement the execution ownership/recovery design selected in task 5.
- [ ] Persist run failure/status information needed after a process restart.
- [ ] Reconcile indexed stories with checkpoints during recovery; leave genuine interrupts waiting.
- [ ] Add narrow node retry policies only at safe boundaries and remove redundant retry layers.
- [ ] Propagate cancellation/timeouts to providers where supported.
- [ ] Test restart, repeated recovery, retry exhaustion and graceful shutdown.

**Done when:** unfinished recoverable runs continue, failed runs remain visibly failed, and two
recovery attempts cannot execute the same story concurrently within the supported deployment.

### 11. Consume graph progress through a typed projection

- [ ] Select the streaming interface supported by the pinned JavaScript version.
- [ ] Replace direct graph-to-service progress mutation with validated graph events/state updates.
- [ ] Reconstruct the client view from durable results/status; treat live messages as optional.
- [ ] Keep background execution independent of a connected browser and retain polling initially.
- [ ] Preserve early playback of completed audio segments.
- [ ] Test disconnect/reconnect, repeated or missing events, out-of-order segment completion and failure.

**Done when:** losing the in-memory projection or client connection does not lose completed audio,
misreport a finished run or launch duplicate work.

### 12. Add SSE only if justified

- [ ] Decide whether polling meets the current latency and simplicity requirements.
- [ ] If SSE is chosen, define event identities, reconnect behaviour, snapshot resynchronisation,
  cleanup and access control; retain a mobile-compatible recovery path.

**Done when:** the decision is recorded; if implemented, reconnect and listener-cleanup tests pass.
This task is optional and is not a durability prerequisite.

## E. Quality and debugging track

This track can start after tasks 1–4 and run alongside C/D; it does not block those tasks.

### 13. Add versioned record/replay fixtures

- [ ] Implement a recording/replay model decorator with synthetic, reviewed examples.
- [ ] Key fixtures by task, prompt/schema version and input; avoid dependence on parallel call order.
- [ ] Fail clearly on missing/mismatched recordings and validate replayed outputs.
- [ ] Add full text-workflow regression cases for approval, clarification and revision.

**Done when:** offline tests are deterministic, make no paid calls and detect stale fixtures.
Recorded outputs validate orchestration; they do not predict live responses to new prompts.

### 14. Establish text-only evaluations

- [ ] Create a small synthetic dataset covering age bands, ambiguous ideas and requested revisions.
- [ ] Add invariant checks and rubrics for coherence, humour, age fit and preservation of child ideas.
- [ ] Calibrate any model judge against human ratings and record model/prompt versions.
- [ ] Add an explicit eval command, cost limits and a baseline experiment with fake TTS.

**Done when:** experiments are repeatable and comparable, with documented limitations and no
TTS quota use. Live runs are separate from the default test suite.

### 15. Write a debugging runbook

- [ ] Document how to locate a synthetic story's checkpoint, trace, failed node and provider attempts.
- [ ] Explain how to distinguish a waiting interrupt, retry, permanent failure and abandoned run.
- [ ] Show a safe fork/replay exercise and how to inspect latency without exposing raw child data.

**Done when:** a developer can diagnose a deliberately injected failure using the runbook.

## F. Before sharing or deployment

These are later release requirements, not prerequisites for the local learning exercises.

### 16. Complete the privacy and data-flow review

- [ ] Use A3 as review input and perform the in-repo F4 audit of actual data flows.
- [ ] Inventory provider requests, traces, logs, checkpoints, recordings and generated audio.
- [ ] Define minimisation, retention, deletion and tracing defaults; verify raw-recording handling.
- [ ] Resolve requirements for sharing with other families using current authoritative guidance.

**Done when:** concrete findings have owners and release gates; real child-derived fixtures or
datasets are not introduced without the resulting safeguards.

### 17. Implement the chosen deployment architecture

- [ ] Add authentication and story ownership checks to story, audio and event endpoints.
- [ ] Configure production persistence, shared audio storage and durable execution ownership.
- [ ] Migrate/version existing checkpoints using the task 5 policy.
- [ ] Add operational recovery, retention/deletion, backups and appropriate health monitoring.
- [ ] Test two-worker contention, cross-account denial, deployment during a run and full deletion.

**Done when:** deployment acceptance tests prove ownership isolation, recovery and storage
consistency. A Postgres checkpointer alone does not satisfy this task.

## Suggested milestones

1. **Understand the graph:** tasks 1–3.
2. **Adopt dynamic fan-out safely:** tasks 4–8.
3. **Recover and report reliably:** tasks 9–11; task 12 optional.
4. **Measure story quality:** tasks 13–15 alongside the migration.
5. **Share safely:** tasks 16–17 before deployment to other families.

The next implementation task, when requested, is task 1. This checklist does not authorise
implementation or live provider/evaluation runs.
