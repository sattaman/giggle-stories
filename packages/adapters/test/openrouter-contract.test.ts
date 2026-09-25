// Contract tests for the structured-output corrective retry (no network).

import type { Logger } from "@storytime/app";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateWithCorrection } from "../src/openrouter/structured-model.ts";

const silent: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const Answer = z.object({ title: z.string().min(1) });
const fields = { task: "outline", model: "test/model" };

/** A scripted provider call: each attempt takes the next outcome and records its correction. */
function scripted(...outcomes: unknown[]) {
  const corrections: (string | undefined)[] = [];
  const call = (correction: string | undefined): Promise<unknown> => {
    corrections.push(correction);
    const next = outcomes.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { call, corrections };
}

describe("generateWithCorrection", () => {
  it("returns valid output from a single call", async () => {
    const { call, corrections } = scripted({ title: "Moon cheese" });
    await expect(generateWithCorrection(call, Answer, silent, fields)).resolves.toEqual({ title: "Moon cheese" });
    expect(corrections).toEqual([undefined]);
  });

  it("retries once with the parse error when output doesn't match the schema", async () => {
    const { call, corrections } = scripted(new Error("Failed to parse. Text: {}. Error: expected string"), { title: "Fixed" });
    await expect(generateWithCorrection(call, Answer, silent, fields)).resolves.toEqual({ title: "Fixed" });
    expect(corrections).toHaveLength(2);
    expect(corrections[1]).toContain("Your previous answer was invalid");
    expect(corrections[1]).toContain("expected string");
  });

  it("gives up after the one corrective retry", async () => {
    const { call, corrections } = scripted(new Error("Failed to parse"), new Error("Failed to parse again"));
    await expect(generateWithCorrection(call, Answer, silent, fields)).rejects.toThrow("Failed to parse again");
    expect(corrections).toHaveLength(2);
  });

  it("propagates provider failures without a corrective retry", async () => {
    const { call, corrections } = scripted(new Error("401 No auth credentials found"));
    await expect(generateWithCorrection(call, Answer, silent, fields)).rejects.toThrow("401");
    expect(corrections).toHaveLength(1);
  });

  it("re-validates at the boundary even when the provider claims success", async () => {
    const { call, corrections } = scripted({ title: "" });
    await expect(generateWithCorrection(call, Answer, silent, fields)).rejects.toBeInstanceOf(z.ZodError);
    expect(corrections).toHaveLength(1); // no corrective retry for this path
  });

  it("classifies by message text, so a provider error mentioning 'expected' is retried as a parse error", async () => {
    // Pins a fragility: one extra paid call on e.g. a 400 whose message says "expected".
    const { call, corrections } = scripted(new Error("400 Bad request: expected max_tokens <= 4000"), { title: "ok" });
    await generateWithCorrection(call, Answer, silent, fields);
    expect(corrections).toHaveLength(2);
  });
});
