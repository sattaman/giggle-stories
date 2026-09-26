// A local HTTP stand-in for OpenRouter's chat completions API. The real ChatOpenRouter talks
// to it, so tests cover LangChain's own request building, tool-call parsing and metadata.

import { createServer, type Server } from "node:http";

export interface ChatReply {
  readonly status: number;
  readonly body: unknown;
}

/** A completion that calls `tool` with `args` (serialised as the model would send them). */
export function toolCall(tool: string, args: unknown, finishReason = "tool_calls"): ChatReply {
  return completion({ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: tool, arguments: JSON.stringify(args) } }] }, finishReason);
}

/** A completion with plain text and no tool call. */
export function textOnly(text: string): ChatReply {
  return completion({ role: "assistant", content: text }, "stop");
}

export function httpError(status: number, message: string): ChatReply {
  return { status, body: { error: { code: status, message } } };
}

function completion(message: unknown, finishReason: string): ChatReply {
  return {
    status: 200,
    body: {
      id: "gen-1",
      object: "chat.completion",
      model: "test/model",
      choices: [{ index: 0, message, finish_reason: finishReason }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    },
  };
}

/** Starts a fake; `handle` decides each reply. Request bodies are recorded in order. */
export async function fakeOpenRouter(handle: (index: number) => ChatReply) {
  const requests: unknown[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      const body: unknown = raw === "" ? {} : JSON.parse(raw);
      requests.push(body);
      const reply = handle(requests.length - 1);
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake OpenRouter has no port");
  return {
    baseURL: `http://127.0.0.1:${String(address.port)}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
