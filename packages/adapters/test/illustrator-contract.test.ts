// OpenRouterIllustrator against a local fake of OpenRouter's Images API; FsImageStore on disk.

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "@storytime/app";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { FsImageStore } from "../src/fs/fs-image-store.ts";
import { OpenRouterIllustrator } from "../src/openrouter/illustrator.ts";
import { fakeOpenRouter, httpError, type ChatReply } from "./fake-openrouter.ts";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const logged: Record<string, unknown>[] = [];
const log: Logger = { info: (fields) => logged.push(fields), warn: () => undefined, error: () => undefined };

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  logged.length = 0;
});

async function illustratorWith(reply: ChatReply) {
  const fake = await fakeOpenRouter(() => reply);
  close = fake.close;
  return { illustrator: new OpenRouterIllustrator("test-key", log, { baseURL: fake.baseURL, model: "test/image" }), requests: fake.requests };
}

describe("OpenRouterIllustrator", () => {
  it("asks for one 4:3 picture and returns its bytes, logging the reported cost", async () => {
    const { illustrator, requests } = await illustratorWith({
      status: 200,
      body: { created: 1, data: [{ b64_json: PNG.toString("base64"), media_type: "image/png" }], usage: { cost: 0.004 } },
    });
    const { image, type } = await illustrator.draw({ prompt: "A hamster chef" });
    expect(Buffer.from(image).equals(PNG)).toBe(true);
    expect(type).toBe("image/png");
    expect(z.object({ model: z.string(), prompt: z.string(), n: z.number(), aspect_ratio: z.string() }).parse(requests[0])).toMatchObject({
      model: "test/image",
      prompt: "A hamster chef",
      n: 1,
      aspect_ratio: "4:3",
    });
    expect(logged.at(-1)).toMatchObject({ model: "test/image", costUsd: 0.004 });
  });

  it("fails clearly on an error status or a response without an image", async () => {
    const failing = await illustratorWith(httpError(402, "Insufficient credits"));
    await expect(failing.illustrator.draw({ prompt: "x" })).rejects.toThrow("OpenRouter images 402");
    await close?.();
    const empty = await illustratorWith({ status: 200, body: { created: 1, data: [] } });
    await expect(empty.illustrator.draw({ prompt: "x" })).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("FsImageStore", () => {
  it("saves under the story with the right extension and resolves it back safely", async () => {
    const root = await mkdtemp(join(tmpdir(), "storytime-images-"));
    const store = new FsImageStore(root, "http://localhost:8787/v1/images");
    expect(await store.save("story_1", "page-1-picture", PNG, "image/png")).toBe("http://localhost:8787/v1/images/story_1/page-1-picture.png");
    expect([...(await readFile(join(root, "story_1", "page-1-picture.png")))]).toEqual([...PNG]);
    expect(store.fileFor("story_1", "page-1-picture.png")).toEqual({ path: join(root, "story_1", "page-1-picture.png"), type: "image/png" });
    expect(store.fileFor("story_1", "../../secret.png")).toBeUndefined();
    expect(store.fileFor("story_1", "page.svg")).toBeUndefined();
    await expect(store.save("../etc", "x", PNG, "image/png")).rejects.toThrow("Unsafe");
  });
});
