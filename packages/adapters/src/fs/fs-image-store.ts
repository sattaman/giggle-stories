// ImageStore on the local filesystem; the server exposes files under /v1/images.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageStore, ImageType } from "@storytime/app";

const SAFE = /^[a-zA-Z0-9_-]+$/;
const EXTENSION: Record<ImageType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const TYPE_OF: Readonly<Record<string, ImageType>> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export class FsImageStore implements ImageStore {
  constructor(
    private readonly root: string,
    private readonly publicBase: string, // e.g. "http://localhost:8787/v1/images"
  ) {}

  async save(storyId: string, name: string, image: Uint8Array, type: ImageType): Promise<string> {
    if (!SAFE.test(storyId) || !SAFE.test(name)) throw new Error(`Unsafe image path: ${storyId}/${name}`);
    const dir = join(this.root, storyId);
    await mkdir(dir, { recursive: true });
    const file = `${name}.${EXTENSION[type]}`;
    await writeFile(join(dir, file), image);
    return `${this.publicBase}/${storyId}/${file}`;
  }

  /** The file to serve for a URL's story and file name, and its type; undefined if unsafe. */
  fileFor(storyId: string, file: string): { readonly path: string; readonly type: ImageType } | undefined {
    const match = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.exec(file);
    const type = TYPE_OF[match?.[1] ?? ""];
    if (!SAFE.test(storyId) || type === undefined) return undefined;
    return { path: join(this.root, storyId, file), type };
  }
}
