// Synthetic, credential-free story dependencies for Studio and learning exercises.
// Every answer is canned: no LLM, TTS or file writes, and nothing derived from a real child.

import type { StructuredModel, StoryDeps } from "../src/ports.ts";
import type { z } from "zod";
import { FakeVoices, RecordingProgress, brief, cast, decisions, fakeAudio, fakeSpeech, outline, script, silentLog } from "../test/fakes.ts";

const REVISED_TITLE = "Revised plan";

/**
 * Answers every writer task with synthetic data. Unlike the queued test fake it is stateless,
 * so any number of Studio threads behave the same: one question, then ready.
 */
export class SyntheticModel implements StructuredModel {
  readonly calls: string[] = [];

  generate<S extends z.ZodType>(request: { readonly task: string; readonly schema: S; readonly prompt: string }): Promise<z.infer<S>> {
    this.calls.push(request.task);
    return Promise.resolve(request.schema.parse(this.answer(request.task, request.prompt)));
  }

  private answer(task: string, prompt: string): unknown {
    switch (task) {
      case "extract_brief":
        return brief;
      case "decide_clarification":
        // Ask once: the first decision sees an empty <already_asked> list.
        return prompt.includes("<already_asked>\n[]") ? decisions.ask : decisions.ready;
      case "cast_characters":
      case "recast_characters":
        return cast;
      case "outline":
        return outline("First plan");
      case "revise_outline":
        return outline(REVISED_TITLE);
      case "write_page":
        return script;
      case "rewrite_voice":
        return { voiceDescription: "A bright, bouncy cartoon voice with a British accent." };
      default:
        throw new Error(`SyntheticModel has no answer for task ${task}`);
    }
  }
}

export function syntheticDeps(overrides: Partial<StoryDeps> = {}): StoryDeps {
  return {
    model: new SyntheticModel(),
    voices: new FakeVoices(),
    speech: fakeSpeech,
    audio: fakeAudio,
    progress: new RecordingProgress(),
    log: silentLog,
    narratorVoiceId: "voice_narrator",
    stockVoices: {},
    voiceLibrary: {},
    ...overrides,
  };
}

/** A synthetic idea: use this (not a real child's words) in Studio and exercises. */
export const syntheticStart = { storyId: "synthetic-1", idea: "Pip builds a rocket out of a bin" } as const;
