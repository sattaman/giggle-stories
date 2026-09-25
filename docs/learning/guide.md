# LangGraph in Storytime: a mini guide

Start here. The details are in [studio.md](studio.md) and [checkpoints.md](checkpoints.md);
the roadmap is in the [task list](langgraph-tasks.md).

## 1. The mental model in six ideas

1. **State** is one typed object shared by the whole run (`StoryState` in
   `packages/app/src/graph/story-graph.ts`: idea, answers, cast, outline, script,
   performance…).
2. **Nodes** are plain async functions: `(state, config) => partial update`. They never
   mutate state. They return the fields they changed, and LangGraph merges them in.
3. **Edges** say what runs next. A static edge always runs; a conditional edge or a
   `Command({ goto })` picks at runtime. `addEdge(["a", "b"], "c")` is a **join**: `c` waits
   for both.
4. **Supersteps.** LangGraph runs in rounds. Every node that's due runs *in parallel* in the
   same round, all of them see the state as it was at the start of that round, and their
   updates are merged at the end. `designVoices` and `planOutline` share round 4 for this
   reason.
5. **Checkpoints.** After every round the whole state is saved (SQLite in the server,
   memory in tests), keyed by `thread_id`, which is our `storyId`. A story is one thread, and
   its history is a list of checkpoints.
6. **Interrupts.** `interrupt(payload)` inside a node pauses the run, saves a checkpoint and
   returns the payload to the caller. Later, `invoke(new Command({ resume: value }))` runs that
   node again **from the top**, and this time `interrupt()` returns `value`.

Idea 6 is why we have a rule: nodes that call `interrupt()` (`askQuestion`,
`reviewOutline`) do nothing costly. Anything before `interrupt()` runs twice.

## 2. How Storytime uses it

```text
understand ─(question?)→ askQuestion ⏸ → understand
    └─(ready)→ castCharacters ─┬→ designVoices ─────────────┐
                               └→ planOutline → draftPage ──┴→ reviewOutline ⏸
reviewOutline ─(changes)→ reviseOutline → recast → redraftPage → reviewOutline
              └─(yes!)→ performPage → END
```

- **Ports stay the boundary.** Nodes never import OpenRouter or Gemini. They call
  `deps.model`, `deps.speech` and so on through the interfaces in `src/ports.ts`.
- **Dependencies travel in the run context**, not in state:
  `graph.invoke(input, { configurable: { thread_id }, context: { deps } })`. State is saved in
  checkpoints; context isn't. That's why clients and API keys belong in context.
- **Who plugs in what:**

  | Where | `deps` come from | Checkpointer |
  | --- | --- | --- |
  | Server (`packages/server/src/main.ts`) | Real adapters | SQLite `data/checkpoints.sqlite` |
  | Unit tests (`test/story-graph.test.ts`) | `test/fakes.ts` (queued answers, recorded calls) | `MemorySaver` |
  | Checkpoint tests (`test/checkpoints.test.ts`) | `dev/synthetic.ts` | SQLite in a temp dir, or memory |
  | Synthetic runner (`dev/run-synthetic.ts`) | `dev/synthetic.ts` | SQLite `data/learning/` |
  | Studio (`dev/studio.ts`) | `defaultDeps` built in, because Studio can only send JSON | The dev server's own |

## 3. How to use what we built

All commands run from the worktree root.

```sh
pnpm check                                          # everything; must pass before committing
pnpm --filter @storytime/app test                   # just the graph tests
pnpm --filter @storytime/app synthetic my-thread    # run a whole fake story, print the history
pnpm --filter @storytime/app graph:mermaid          # after changing edges; a test catches drift
pnpm --filter @storytime/app studio                 # then open the Studio URL it prints
```

**Studio.** Open `https://smith.langchain.com/studio?baseUrl=http://localhost:2024` and
start a thread with `{ "storyId": "s1", "idea": "Pip builds a rocket out of a bin" }`.

1. The run pauses with a question. Resume with `"Moon cheese"`.
2. It pauses at outline review. Resume with `{ "approved": false, "feedback": "spookier" }`
   to see a revision, then `{ "approved": true }`.
3. Click any past step to see the state at that point. Editing a step and re-running it
   creates a fork; the next section explains the rules.

No real model or voice is called. The answers are canned and free.

## 4. Continuing a story: three different things

| You want to… | Do this | Watch out |
| --- | --- | --- |
| Answer a pause | `invoke(new Command({ resume }), { configurable: { thread_id } })` | The paused node re-runs from the top |
| Recover after a crash | `invoke(null, { configurable: { thread_id } })` | Rounds that finished are kept; a node that died midway starts over |
| Try an alternative from the past | `const fork = await graph.updateState(oldConfig, {})`, then resume `fork` | Don't resume `oldConfig` directly: it replays the answer already stored there |

The server only does the first. The third is for Studio and experiments.

## 5. Testing: which kind of test for which question

- **"Does this node's logic work?"** Call the graph with fakes and assert on the outputs
  and on the recorded calls (`model.calls`, `voices.designed`). The existing
  `story-graph.test.ts` does this, and ports make it cheap.
- **"What happens across pauses, restarts and forks?"** Run the compiled graph against a
  checkpointer and check history or fake call counts, as `checkpoints.test.ts` does. Only a
  whole-graph run can answer these.
- **"Is the story any good?"** Evals (task 14). Fakes can't tell you this.

A useful trick: give a fresh session *new* fakes after a restart. If they record zero calls,
nothing was repeated.

## 6. What's next and why

- **Tasks 4–6:** pin down failure behaviour (adapters, overlapping replies, crashes) and
  write down who retries and who restarts runs, *before* changing any of it.
- **Tasks 7–8:** replace `Promise.all` in voice design with `Send`, so each character
  becomes a separate task LangGraph can see, checkpoint and retry.
- **Tasks 9–11:** smaller save points so a crash mid-page keeps finished audio, then
  progress reported from the graph instead of an in-memory map.
