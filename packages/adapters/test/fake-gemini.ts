// A local HTTP stand-in for the Gemini API. The real @google/genai SDK talks to it, so tests
// cover the SDK's own request building and error shapes (which our quota logic depends on).

import { createServer, type Server } from "node:http";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { toWav } from "../src/gemini/wav.ts";

export interface FakeRequest {
  /** "interactions" | "voices" | "generateContent" */
  readonly api: string;
  /** Model named in the path (generateContent) or body (interactions/voices). */
  readonly model: string;
  readonly body: unknown;
}

export interface FakeReply {
  readonly status: number;
  readonly body: unknown;
}

const WithModel = z.object({ model: z.string().optional(), voice: z.object({ model: z.string() }).optional() });

export const PCM_BASE64 = Buffer.alloc(4800).toString("base64"); // 100 ms of silence at 24 kHz
export const WAV_BASE64 = Buffer.from(toWav(Buffer.alloc(4800))).toString("base64");

export const reply = {
  audio: (): FakeReply => ({ status: 200, body: { output_audio: { data: PCM_BASE64 } } }),
  emptyAudio: (): FakeReply => ({ status: 200, body: { output_audio: { data: "" } } }),
  legacyAudio: (): FakeReply => ({ status: 200, body: { candidates: [{ content: { parts: [{ inlineData: { data: PCM_BASE64 } }] } }] } }),
  legacyNoAudio: (): FakeReply => ({ status: 200, body: { candidates: [{ content: {} }] } }),
  voice: (id: string): FakeReply => ({ status: 200, body: { id, sample_audio: { data: WAV_BASE64 } } }),
  error: (status: number, message: string): FakeReply => ({ status, body: { error: { code: status, message, status: "ERROR" } } }),
  rateLimited: (seconds: number): FakeReply => reply.error(429, `Resource exhausted. Please retry in ${String(seconds)}s.`),
  /** Wording the adapter was built against (voice spike): it detects "per day". */
  dailyQuota: (): FakeReply => reply.error(429, "Quota exceeded: 100 requests per day for this model. Please retry in 1h2m3s."),
};

/** Starts a fake; `handle` decides each reply. Every request is recorded in order. */
export async function fakeGemini(handle: (request: FakeRequest, index: number) => FakeReply) {
  const requests: FakeRequest[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      const body: unknown = raw === "" ? {} : JSON.parse(raw);
      const url = req.url ?? "";
      const pathModel = /models\/([^:]+):generateContent/.exec(url)?.[1];
      const named = WithModel.parse(body);
      const request: FakeRequest = {
        api: pathModel !== undefined ? "generateContent" : url.includes("/voices") ? "voices" : "interactions",
        model: pathModel ?? named.model ?? named.voice?.model ?? "",
        body,
      };
      requests.push(request);
      const { status, body: out } = handle(request, requests.length - 1);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake Gemini has no port");
  const ai = new GoogleGenAI({ apiKey: "test-key", httpOptions: { baseUrl: `http://127.0.0.1:${String(address.port)}` } });
  return {
    ai,
    requests,
    models: () => requests.map((r) => r.model),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}

/** Records waits instead of sleeping. */
export function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: (ms: number) => (waits.push(ms), Promise.resolve()) };
}
