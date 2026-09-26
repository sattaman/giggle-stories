// OpenRouterIllustrator against a local fake of OpenRouter's Images API; FsImageStore on disk.

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "@storytime/app";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { z } from "zod";
import { FsImageStore } from "../src/fs/fs-image-store.ts";
import { OpenRouterIllustrator } from "../src/openrouter/illustrator.ts";
import { OpenRouterSceneDrawer } from "../src/openrouter/scene-drawer.ts";
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
  it("stores a web-ready JPEG, at most 1024 px wide, and resolves it back safely", async () => {
    const root = await mkdtemp(join(tmpdir(), "storytime-images-"));
    const store = new FsImageStore(root, "http://localhost:8787/v1/images");
    const big = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#f5a623" } }).png().toBuffer();
    expect(await store.save("story_1", "page-1-picture", big)).toBe("http://localhost:8787/v1/images/story_1/page-1-picture.jpg");
    const saved = await sharp(await readFile(join(root, "story_1", "page-1-picture.jpg"))).metadata();
    expect(saved).toMatchObject({ format: "jpeg", width: 1024, height: 768 });
    expect(store.fileFor("story_1", "page-1-picture.jpg")).toEqual({ path: join(root, "story_1", "page-1-picture.jpg"), type: "image/jpeg" });
    expect(store.fileFor("story_1", "../../secret.jpg")).toBeUndefined();
    expect(store.fileFor("story_1", "page.png")).toBeUndefined();
    await expect(store.save("../etc", "x", big)).rejects.toThrow("Unsafe");
  });
});

describe("OpenRouterSceneDrawer", () => {
  const answer = (content: string): ChatReply => ({
    status: 200,
    body: { id: "gen-1", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { completion_tokens: 3000, cost: 0.0065 } },
  });

  it("asks for medium reasoning and returns the answer's svg block", async () => {
    const fake = await fakeOpenRouter(() => answer('<plan>Biscuit behind a raisin</plan>\n```svg\n<svg viewBox="0 0 800 600"></svg>\n```'));
    close = fake.close;
    const drawer = new OpenRouterSceneDrawer("test-key", log, { baseURL: fake.baseURL, model: "test/text" });
    await expect(drawer.draw({ prompt: "Draw Biscuit" })).resolves.toEqual({ svg: '<svg viewBox="0 0 800 600"></svg>' });
    expect(z.object({ model: z.string(), reasoning: z.object({ effort: z.string() }) }).parse(fake.requests[0])).toMatchObject({ model: "test/text", reasoning: { effort: "medium" } });
    expect(logged.at(-1)).toMatchObject({ model: "test/text", costUsd: 0.0065 });
  });

  it("fails when the answer has no svg", async () => {
    const fake = await fakeOpenRouter(() => answer("Sorry, I can't draw that."));
    close = fake.close;
    await expect(new OpenRouterSceneDrawer("k", log, { baseURL: fake.baseURL }).draw({ prompt: "x" })).rejects.toThrow("no ```svg block");
  });
});

describe("FsImageStore scenes", () => {
  it("saves an SVG scene as-is and serves it as image/svg+xml", async () => {
    const root = await mkdtemp(join(tmpdir(), "storytime-scenes-"));
    const store = new FsImageStore(root, "http://localhost:8787/v1/images");
    const svg = '<svg viewBox="0 0 8 6"></svg>';
    expect(await store.saveScene("story_1", "page-1-scene", svg)).toBe("http://localhost:8787/v1/images/story_1/page-1-scene.svg");
    expect(await readFile(join(root, "story_1", "page-1-scene.svg"), "utf8")).toBe(svg);
    expect(store.fileFor("story_1", "page-1-scene.svg")).toMatchObject({ type: "image/svg+xml" });
  });
});
