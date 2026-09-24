// AudioStore on the local filesystem; the server exposes files under /v1/audio.
// (Cloud Storage later — same port.)

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AudioStore } from "@storytime/app";

const SAFE = /^[a-zA-Z0-9_-]+$/;

export class FsAudioStore implements AudioStore {
  constructor(
    private readonly root: string,
    private readonly publicBase: string, // e.g. "http://localhost:8787/v1/audio"
  ) {}

  async save(storyId: string, name: string, wav: Uint8Array): Promise<string> {
    if (!SAFE.test(storyId) || !SAFE.test(name)) throw new Error(`Unsafe audio path: ${storyId}/${name}`);
    const dir = join(this.root, storyId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.wav`), wav);
    return `${this.publicBase}/${storyId}/${name}.wav`;
  }

  pathFor(storyId: string, file: string): string | undefined {
    if (!SAFE.test(storyId) || !/^[a-zA-Z0-9_-]+\.wav$/.test(file)) return undefined;
    return join(this.root, storyId, file);
  }
}
