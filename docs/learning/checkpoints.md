# Checkpoints, resume and time travel

Task 3 of the [task list](langgraph-tasks.md). The tests are in
`packages/app/test/checkpoints.test.ts`, and they use synthetic dependencies only.

## Why node tests aren't enough

A node test calls one function with a state and checks what it returns. Checkpoint behaviour
comes from the *runtime*: supersteps, pending writes, stored resume values and which tasks
are still due when a thread is reopened. None of that exists until the compiled graph runs
against a checkpointer, so these are whole-graph tests.

## What the tests establish

| Test | Behaviour |
| --- | --- |
| records one checkpoint per superstep | History to outline review is `-1 __start__ → 0 understand → 1 askQuestion → 2 understand → 3 castCharacters → 4 designVoices+planOutline → 5 draftPage → 6 reviewOutline`. Parallel nodes share a checkpoint. |
| resumes after SQLite close/reopen | The "process" dies at outline review. A new saver, graph and fakes resume the approval and perform the page. The new model and voice fakes record **zero** calls, so nothing before the pause re-runs. |
| replays the stored answer | Resuming an *already answered* checkpoint again ignores the new answer. The original approval is stored on that checkpoint as a `__resume__` pending write, so LangGraph replays it and runs `performPage` again (four more TTS calls in production). |
| forks from outline review | `updateState(oldReviewConfig, {})` writes a new checkpoint with no stored answer. Resuming it with a revision runs only `extract_brief → revise_outline → recast_characters → write_page`. The approved branch stays intact under its own checkpoint id, and the thread head moves to the fork. |
| interrupt nodes re-run from the top | A counter before `interrupt()` reaches 2: once to pause and once to resume. That is why `askQuestion` and `reviewOutline` have no side effects. |

## Three kinds of "continuing"

| | What you pass | What runs | Risk |
| --- | --- | --- | --- |
| **Interrupt resume** | `Command({ resume })` on the thread (head) | The interrupted node from the top, then onwards | Side effects in the interrupt node repeat |
| **Failure recovery** | `invoke(null, thread)` after a crash or error | Tasks still due at the last checkpoint. Completed parallel siblings keep their pending writes | A node that crashed midway repeats *all* of its work (task 9) |
| **Deliberate fork** | `updateState(oldConfig, values)` then invoke/resume the returned config | Everything after the forked checkpoint, on a new branch | Resuming an old checkpoint *without* forking replays old answers |

The server only ever resumes the thread head (`thread_id`, never a `checkpoint_id`), so the
replay hazard can't happen in production today. What a stale or repeated approval does
after the story has finished is a question for task 6.

## Exercise

1. Before running the replay test, predict what `resume: { approved: false, … }` on the old
   review checkpoint will do. Then read `saver.getTuple(atReview.config).pendingWrites` and
   find the `__resume__` entry.
2. In the restart test, move `before.db.close()` to just after `castCharacters` finishes.
   Hint: `interruptAfter: ["castCharacters"]` at compile time. Predict which fakes will
   record calls after reopening.
3. Change the fork to `updateState(atReview.config, { outlineFeedback: "x" }, "reviewOutline")`.
   Which node runs next, and why? `asNode` makes the update look as if that node produced it.
