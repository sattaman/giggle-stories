# Failure contracts (task 4)

What each layer does when something goes wrong, pinned by tests that make no network calls.
This is the evidence for task 5, which decides who should own retries.

## How the tests work

| Layer | Test file | Technique |
| --- | --- | --- |
| Gemini TTS and voice design | `packages/adapters/test/gemini-contract.test.ts` | The **real** `@google/genai` SDK talks to a local fake HTTP server (`test/fake-gemini.ts`), so the SDK's own error objects are exercised. `sleep` is injected and records waits instead of waiting. |
| OpenRouter structured output | `packages/adapters/test/openrouter-contract.test.ts` | `generateWithCorrection` was extracted from the adapter and is driven by a scripted call. |
| Story writer | `packages/app/test/failures.test.ts` | `FakeModel` with queued answers. |
| Graph: voices | `packages/app/test/voices.test.ts` | Whole graph with two characters and a voice library. |
| Graph: fallbacks and failures | `packages/app/test/failures.test.ts` | Whole graph with failing fakes. |

Production changes were limited to test seams: `GeminiSpeech` and `GeminiVoiceDesigner` take
an optional `{ sleep, models }`, and the OpenRouter correction loop is now a named function.
Behaviour is unchanged.

## The contracts

**Gemini TTS, one line of speech**
- 429 with "retry in Ns": waits N s + 250 ms (capped at 20 s) and retries, up to 5 attempts.
- 5xx: backs off 2, 4, 8, 16 s, then gives up after 5 attempts.
- 400 or other client errors: fails at once. No retry, no fallback.
- Daily quota: no wait. The model is marked exhausted until the reset time and the next one
  is tried, in this order: `3.8-flash-tts → 3.8-flash-lite-tts → legacy ×3`. The legacy models
  use the character's built-in fallback voice and drop tags like `<giggle>`. Later calls skip
  exhausted models.
- A legacy model that returns no audio: the next legacy model is tried.
- Every model exhausted: the last quota error is thrown.

**Voice design:** a safety block (400 mentioning "safety") becomes `VoiceRejectedError`
without a retry, and the graph then rewrites the description or falls back. 429 is retried
like TTS.

**OpenRouter:** the SDK retries transport errors (`maxRetries: 3`, not testable offline).
Above that there is one corrective retry when the error message looks like a parse failure;
any other error propagates. Output is re-validated with zod even on success.

**Story writer:** `cast` asks again once if a character from the brief is missing.
`writePage` asks again once if lines are invalid, then drops lines with unknown speakers.

**Graph**
- Deliberate text-only fallbacks: if question TTS fails, the question is still asked with
  `questionAudioUrl: null`. If one line's TTS fails, that line has `audioUrl: null` and the
  others are still performed.
- A permanent model failure rejects the run. The thread stays at the failed node
  (`next: ["understand"]`), so it could be retried with `invoke(null)` (task 10).
- Voices: two characters never share a library voice. Cast order is kept. On recast only
  characters whose voice changed are re-voiced, their new sample gets a `-rN` suffix, removed
  characters are dropped and added ones are voiced.

## Findings

None of these are fixed yet. Each would be a separate, focused change.

1. **Daily-quota detection depends on the words "per day".** Nobody has checked this against
   a real message in the repo; it comes from the voice spike. If Google's wording differs, a
   daily quota is treated as a short rate limit: 4 waits of 20 s, and then the line is silent
   instead of falling back. A test pins this failure mode. Fix: capture one real
   daily-quota error, then match its structured details rather than the message.
2. **An empty audio response from the main TTS models fails the line without trying the next
   model.** The legacy path *does* move on when it gets no audio. This is inconsistent: the
   primary path could fall back too, at the cost of one more quota request.
3. **OpenRouter's parse-failure check is a regex** (`parse|schema|expected`). A provider
   error whose message contains "expected" causes one extra paid call.
4. **Retries multiply across layers.** Worst case for one `generate` call is (1 + 3 SDK
   retries) × 2 correction attempts = 8 HTTP calls. Writer corrections double that to 16 for
   `cast` or `writePage`. One TTS line can make 5 attempts per model on 5xx before failing.
   Task 5 should set total budgets before any LangGraph node retries are added.
