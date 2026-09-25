// Contract tests for the Gemini adapters against a local fake API (no network, no quota).
// They pin down attempt counts, waits and fallback order: the retry budget task 5 builds on.

import { VoiceRejectedError, type Logger } from "@storytime/app";
import { afterEach, describe, expect, it } from "vitest";
import { GeminiSpeech, GeminiVoiceDesigner, LEGACY_TTS_MODELS, TTS_FALLBACK_MODEL, TTS_MODEL } from "../src/gemini/gemini.ts";
import { fakeGemini, recordingSleep, reply, type FakeReply, type FakeRequest } from "./fake-gemini.ts";

const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const line = { text: "<giggle> To the MOON!", voiceId: "voices/pip", fallbackVoice: "Leda", style: "thrilled" };
const [LEGACY_1, LEGACY_2] = LEGACY_TTS_MODELS;

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function speechWith(handle: (request: FakeRequest, index: number) => FakeReply) {
  const fake = await fakeGemini(handle);
  close = fake.close;
  const clock = recordingSleep();
  return { ...fake, ...clock, speech: new GeminiSpeech(fake.ai, silent, { sleep: clock.sleep }) };
}

describe("GeminiSpeech", () => {
  it("synthesises with the designed voice on the primary model", async () => {
    const { speech, requests } = await speechWith(() => reply.audio());
    const result = await speech.synthesize(line);
    expect(result.durationMs).toBe(100);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      api: "interactions",
      model: TTS_MODEL,
      body: { generation_config: { speech_config: [{ voice: "voices/pip" }] } },
    });
  });

  it("retries a transient rate limit after the server's hinted wait", async () => {
    const { speech, models, waits } = await speechWith((_, i) => (i === 0 ? reply.rateLimited(2) : reply.audio()));
    await speech.synthesize(line);
    expect(models()).toEqual([TTS_MODEL, TTS_MODEL]);
    expect(waits).toEqual([2250]);
  });

  it("gives up on server errors after five attempts with exponential waits", async () => {
    const { speech, models, waits } = await speechWith(() => reply.error(503, "overloaded"));
    await expect(speech.synthesize(line)).rejects.toMatchObject({ status: 503 });
    expect(models()).toEqual(Array.from({ length: 5 }, () => TTS_MODEL));
    expect(waits).toEqual([2000, 4000, 8000, 16000]);
  });

  it("does not retry or fall back on a bad request", async () => {
    const { speech, requests } = await speechWith(() => reply.error(400, "invalid voice"));
    await expect(speech.synthesize(line)).rejects.toMatchObject({ status: 400 });
    expect(requests).toHaveLength(1);
  });

  it("moves to the fallback model on daily quota, and skips the exhausted model afterwards", async () => {
    const { speech, models, waits } = await speechWith((r) => (r.model === TTS_MODEL ? reply.dailyQuota() : reply.audio()));
    await speech.synthesize(line);
    expect(models()).toEqual([TTS_MODEL, TTS_FALLBACK_MODEL]);
    await speech.synthesize(line);
    expect(models()).toEqual([TTS_MODEL, TTS_FALLBACK_MODEL, TTS_FALLBACK_MODEL]);
    expect(waits).toEqual([]); // daily quota is never waited out
  });

  it("mistakes a daily quota for a transient limit if Google's wording drops \"per day\"", async () => {
    // Detection is by message text. This pins the failure mode: five attempts at the capped
    // 20s wait instead of an immediate fallback. Structured quota details would be sturdier.
    const { speech, models, waits } = await speechWith(() =>
      reply.error(429, "Quota exceeded for metric: generate_requests_per_model_per_day. Please retry in 1h2m3s."),
    );
    await expect(speech.synthesize(line)).rejects.toMatchObject({ status: 429 });
    expect(models()).toEqual(Array.from({ length: 5 }, () => TTS_MODEL));
    expect(waits).toEqual([20_000, 20_000, 20_000, 20_000]);
  });

  it("uses a legacy model with the built-in voice and no vocal tags when both designed-voice models are exhausted", async () => {
    const { speech, requests, models } = await speechWith((r) => (r.api === "interactions" ? reply.dailyQuota() : reply.legacyAudio()));
    await speech.synthesize(line);
    expect(models()).toEqual([TTS_MODEL, TTS_FALLBACK_MODEL, LEGACY_1]);
    expect(JSON.stringify(requests[2]?.body)).toContain('"voiceName":"Leda"');
    expect(JSON.stringify(requests[2]?.body)).toContain("Say in a thrilled way: To the MOON!");
  });

  it("tries the next legacy model when one returns no audio", async () => {
    const { speech, models } = await speechWith((r) =>
      r.api === "interactions" ? reply.dailyQuota() : r.model === LEGACY_1 ? reply.legacyNoAudio() : reply.legacyAudio(),
    );
    await speech.synthesize(line);
    expect(models()).toEqual([TTS_MODEL, TTS_FALLBACK_MODEL, LEGACY_1, LEGACY_2]);
  });

  it("fails with the last quota error once every model is exhausted", async () => {
    const { speech, requests } = await speechWith(() => reply.dailyQuota());
    await expect(speech.synthesize(line)).rejects.toMatchObject({ status: 429 });
    expect(requests).toHaveLength(2 + LEGACY_TTS_MODELS.length);
  });

  it("treats an empty audio response from the primary model as a failure, without fallback", async () => {
    // Current behaviour: the zod boundary rejects it and no other model is tried.
    // performPage then skips the line (text only). See the task 4 notes.
    const { speech, models } = await speechWith(() => reply.emptyAudio());
    await expect(speech.synthesize(line)).rejects.toThrow();
    expect(models()).toEqual([TTS_MODEL]);
  });
});

describe("GeminiVoiceDesigner", () => {
  async function designerWith(handle: (request: FakeRequest, index: number) => FakeReply) {
    const fake = await fakeGemini(handle);
    close = fake.close;
    const clock = recordingSleep();
    return { ...fake, ...clock, designer: new GeminiVoiceDesigner(fake.ai, silent, { sleep: clock.sleep }) };
  }
  const request = { name: "Pip", gender: "female" as const, description: "A bright cartoon voice" };

  it("returns the voice id and preview", async () => {
    const { designer, requests } = await designerWith(() => reply.voice("voices/pip"));
    const voice = await designer.design(request);
    expect(voice.voiceId).toBe("voices/pip");
    expect(voice.preview?.byteLength).toBeGreaterThan(0);
    expect(requests[0]).toMatchObject({ api: "voices", model: TTS_MODEL });
  });

  it("maps a safety block to VoiceRejectedError, without retrying", async () => {
    const { designer, requests } = await designerWith(() => reply.error(400, "Blocked by safety policies"));
    await expect(designer.design(request)).rejects.toBeInstanceOf(VoiceRejectedError);
    expect(requests).toHaveLength(1);
  });

  it("retries a transient rate limit", async () => {
    const { designer, requests, waits } = await designerWith((_, i) => (i === 0 ? reply.rateLimited(1) : reply.voice("v")));
    await designer.design(request);
    expect(requests).toHaveLength(2);
    expect(waits).toEqual([1250]);
  });
});
