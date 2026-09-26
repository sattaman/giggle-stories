// ImageStore on the local filesystem; the server exposes files under /v1/images.
// Every picture is stored web-ready: at most 1024 px wide, JPEG quality 85. Image models
// return large PNGs (about 2 MB; watercolour texture compresses badly losslessly) and don't
// all honour a requested output format, so the store re-encodes rather than trusting them.

import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageStore, ImageType } from "@storytime/app";
import sharp from "sharp";

const SAFE = /^[a-zA-Z0-9_-]+$/;
const MAX_WIDTH = 1024;
const QUALITY = 85;

export class FsImageStore implements ImageStore {
  constructor(
    private readonly root: string,
    private readonly publicBase: string, // e.g. "http://localhost:8787/v1/images"
  ) {}

  async save(storyId: string, name: string, image: Uint8Array): Promise<string> {
    if (!SAFE.test(storyId) || !SAFE.test(name)) throw new Error(`Unsafe image path: ${storyId}/${name}`);
    const jpeg = await sharp(image).resize({ width: MAX_WIDTH, withoutEnlargement: true }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
    const dir = join(this.root, storyId);
    await mkdir(dir, { recursive: true });
    const file = `${name}.jpg`;
    // Write then rename, so a reader never sees a half-written picture.
    await writeFile(join(dir, `${file}.tmp`), jpeg);
    await rename(join(dir, `${file}.tmp`), join(dir, file));
    return `${this.publicBase}/${storyId}/${file}`;
  }

  /** The file to serve for a URL's story and file name, and its type; undefined if unsafe. */
  fileFor(storyId: string, file: string): { readonly path: string; readonly type: ImageType } | undefined {
    if (!SAFE.test(storyId) || !/^[a-zA-Z0-9_-]+\.jpg$/.test(file)) return undefined;
    return { path: join(this.root, storyId, file), type: "image/jpeg" };
  }
}
