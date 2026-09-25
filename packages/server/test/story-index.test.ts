import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StoryIndex } from "../src/story-index.ts";

describe("StoryIndex", () => {
  it("lists indexed stories newest first, plus older ones found by their audio folders", async () => {
    const data = await mkdtemp(join(tmpdir(), "storytime-index-"));
    const audio = join(data, "audio");
    await mkdir(join(audio, "story_old"), { recursive: true });
    await mkdir(join(audio, "narration"), { recursive: true });
    const index = new StoryIndex(data, audio);
    await index.add({ id: "story_a", createdAt: "2099-01-01T10:00:00.000Z", ageBand: "0-4" });
    await index.add({ id: "story_b", createdAt: "2099-01-02T10:00:00.000Z", ageBand: "9-12" });

    const ids = (await index.list()).map((entry) => entry.id);
    expect(ids.slice(0, 2)).toEqual(["story_b", "story_a"]);
    expect(ids).toContain("story_old");
    expect(ids).not.toContain("narration");
  });
});
