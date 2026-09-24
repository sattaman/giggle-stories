import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsAudioStore } from "../src/fs/fs-audio-store.ts";
import { retryDelayMs } from "../src/gemini/gemini.ts";
import { durationMs, silence, toPcm, toWav } from "../src/gemini/wav.ts";

describe("wav helpers", () => {
  it("round-trips PCM through a WAV header", () => {
    const pcm = silence(500);
    expect(durationMs(pcm)).toBe(500);
    const wav = toWav(pcm);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(toPcm(wav).equals(pcm)).toBe(true);
  });

  it("passes raw PCM through unchanged", () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    expect(toPcm(pcm)).toBe(pcm);
  });
});

describe("FsAudioStore", () => {
  it("saves under the story folder and returns a public URL", async () => {
    const root = await mkdtemp(join(tmpdir(), "storytime-audio-"));
    const store = new FsAudioStore(root, "http://localhost:8787/v1/audio");
    const url = await store.save("story_1", "page-1-00", new Uint8Array([9, 9]));
    expect(url).toBe("http://localhost:8787/v1/audio/story_1/page-1-00.wav");
    expect([...(await readFile(join(root, "story_1", "page-1-00.wav")))]).toEqual([9, 9]);
  });

  it("rejects path traversal", async () => {
    const store = new FsAudioStore(tmpdir(), "http://x");
    await expect(store.save("../etc", "passwd", new Uint8Array())).rejects.toThrow(/Unsafe/);
    expect(store.pathFor("story", "../../secret.wav")).toBeUndefined();
    expect(store.pathFor("story", "page-1-00.wav")).toBe(join(tmpdir(), "story", "page-1-00.wav"));
  });
});

describe("retryDelayMs", () => {
  it("parses Gemini's retry hints", () => {
    expect(retryDelayMs("Please retry in 22s or upgrade")).toBe(22_000);
    expect(retryDelayMs("Please retry in 1h16m13s or upgrade")).toBe((3600 + 16 * 60 + 13) * 1000);
    expect(retryDelayMs("Please retry in 2.5s")).toBe(2500);
    expect(retryDelayMs("no hint here")).toBeUndefined();
  });
});
