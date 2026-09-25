// A small append-only index of stories (id, when, for whom) so the library page can list them.
// The stories themselves live in the LangGraph checkpoints and the audio store.

import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { AgeBand, DEFAULT_AGE_BAND } from "@storytime/domain";
import { z } from "zod";

const Entry = z.object({ id: z.string(), createdAt: z.string(), ageBand: AgeBand });
export type StoryIndexEntry = z.infer<typeof Entry>;

export class StoryIndex {
  private readonly path: string;

  constructor(
    private readonly dataDir: string,
    private readonly audioDir: string,
  ) {
    this.path = join(dataDir, "stories.jsonl");
  }

  async add(entry: StoryIndexEntry): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`);
  }

  /** Most recent first. Stories from before the index existed are found via their audio folders. */
  async list(): Promise<StoryIndexEntry[]> {
    const entries = new Map<string, StoryIndexEntry>();
    try {
      for (const line of (await readFile(this.path, "utf8")).split("\n")) {
        if (line.trim() === "") continue;
        const parsed = Entry.safeParse(JSON.parse(line));
        if (parsed.success) entries.set(parsed.data.id, parsed.data);
      }
    } catch {
      // No index yet.
    }
    try {
      for (const dir of await readdir(this.audioDir)) {
        if (!/^story_[a-z0-9]+$/.test(dir) || entries.has(dir)) continue;
        const info = await stat(join(this.audioDir, dir));
        entries.set(dir, { id: dir, createdAt: info.birthtime.toISOString(), ageBand: DEFAULT_AGE_BAND });
      }
    } catch {
      // No audio yet.
    }
    return [...entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
