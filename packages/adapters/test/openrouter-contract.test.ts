// Contract tests for the OpenRouter adapter: the real ChatOpenRouter against a local fake API
// (no network, no cost). They pin what the model is told when its output doesn't fit.

import type { Logger } from "@storytime/app";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenRouterStructuredModel, TruncatedOutputError } from "../src/openrouter/structured-model.ts";
import { fakeOpenRouter, httpError, textOnly, toolCall, type ChatReply } from "./fake-openrouter.ts";

const Answer = z.object({ title: z.string().min(1), pages: z.number().int().min(1) });
const request = { task: "outline", schema: Answer, system: "You write stories.", prompt: "Plan a story.", creative: true };

const logged: { message: string; fields: Record<string, unknown> }[] = [];
const log: Logger = {
  info: (fields, message) => logged.push({ message, fields }),
  warn: (fields, message) => logged.push({ message, fields }),
  error: () => undefined,
};

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  logged.length = 0;
});

async function modelWith(handle: (index: number) => ChatReply) {
  const fake = await fakeOpenRouter(handle);
  close = fake.close;
  const model = new OpenRouterStructuredModel("test-key", log, { baseURL: fake.baseURL, models: { fast: "test/fast", creative: "test/creative" } });
  return { model, requests: fake.requests };
}

/** The user message of request `index`, where corrections are appended. */
function userText(requests: unknown[], index: number): string {
  const body = z.object({ messages: z.array(z.object({ role: z.string(), content: z.unknown() })) }).parse(requests[index]);
  return JSON.stringify(body.messages.find((m) => m.role === "user")?.content);
}

describe("OpenRouterStructuredModel", () => {
  it("forces the task's tool and returns validated arguments, logging token usage", async () => {
    const { model, requests } = await modelWith(() => toolCall("outline", { title: "Moon Cheese", pages: 6 }));
    await expect(model.generate(request)).resolves.toEqual({ title: "Moon Cheese", pages: 6 });
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0])).toContain('"name":"outline"');
    expect(logged.at(-1)).toMatchObject({ message: "llm call", fields: { task: "outline", inputTokens: 120, outputTokens: 30 } });
  });

  it("asks again with the zod issues when the arguments don't fit, however long the answer", async () => {
    const long = { title: "", pages: 0, notes: "x".repeat(5000) };
    const { model, requests } = await modelWith((i) => (i === 0 ? toolCall("outline", long) : toolCall("outline", { title: "Fixed", pages: 6 })));
    await expect(model.generate(request)).resolves.toEqual({ title: "Fixed", pages: 6 });
    expect(requests).toHaveLength(2);
    const correction = userText(requests, 1);
    expect(correction).toContain("didn't fit the required format");
    expect(correction).toContain("title");
    expect(correction).toContain("pages");
    expect(correction).not.toContain("xxxxxxxxxx"); // the issues, not an echo of the answer
  });

  it("asks again when the model answers in text instead of calling the tool", async () => {
    const { model, requests } = await modelWith((i) => (i === 0 ? textOnly("Here is a story!") : toolCall("outline", { title: "T", pages: 1 })));
    await model.generate(request);
    expect(userText(requests, 1)).toContain("You didn't call the outline tool");
  });

  it("gives up after one correction", async () => {
    const { model, requests } = await modelWith(() => toolCall("outline", { title: "" }));
    await expect(model.generate(request)).rejects.toThrow("invalid after a correction");
    expect(requests).toHaveLength(2);
  });

  it("doesn't re-ask when the answer was cut off at the token limit", async () => {
    const { model, requests } = await modelWith(() => toolCall("outline", { title: "Half" }, "length"));
    await expect(model.generate(request)).rejects.toBeInstanceOf(TruncatedOutputError);
    expect(requests).toHaveLength(1);
  });

  it("passes a client error straight through, without a corrective re-ask", async () => {
    const { model, requests } = await modelWith(() => httpError(400, "expected max_tokens <= 4000"));
    await expect(model.generate(request)).rejects.toThrow();
    expect(requests).toHaveLength(1); // 4xx isn't retried by LangChain, and isn't mistaken for bad output
  });
});
