// 16-bit mono linear PCM helpers (Gemini TTS: 24 kHz). We request raw audio/l16
// so segments can be concatenated and wrapped in a single WAV header.

export const SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;

export function silence(ms: number): Buffer {
  const samples = Math.round((SAMPLE_RATE * ms) / 1000);
  return Buffer.alloc(samples * BYTES_PER_SAMPLE);
}

export function durationMs(pcm: Buffer): number {
  return Math.round((pcm.length / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000);
}

/** Returns the PCM payload whether the bytes are raw l16 or a RIFF/WAV file. */
export function toPcm(bytes: Buffer): Buffer {
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF") return bytes;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString("ascii");
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "data") return bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV file has no data chunk");
}

export function toWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
