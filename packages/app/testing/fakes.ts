// In-memory fakes for every port, so the graph can be tested without any LLM or TTS.

import type { Cast, ClarificationDecision, Outline, PageScript, StoryBrief } from "@storytime/domain";
import {
  VoiceRejectedError,
  type AudioStore,
  type Logger,
  type SpeechSynthesizer,
  type StoryDeps,
  type StructuredModel,
  type VoiceDesigner,
} from "../src/ports.ts";

export const brief: StoryBrief = {
  premise: "Pip the inventor builds a rocket to find the lost moon cheese.",
  characters: [{ name: "Pip", role: "hero", gender: "female", details: "inventor, loves jam" }],
  setting: "a back garden",
  tone: "funny adventure",
  childIdeas: ["a rocket made from a bin", "moon cheese"],
};

export const cast: Cast = {
  characters: [
    {
      id: "pip",
      name: "Pip",
      role: "hero",
      emoji: "🚀",
      colour: "#ff8800",
      personality: "fearless inventor",
      comicTrait: "builds everything out of bins",
      gender: "female",
      voiceArchetype: "kid-hero-female",
      voiceDescription: "A very high, soft, adorable animated-character voice, bouncy and excitable.",
      hello: "Hi! I'm Pip, and I build rockets out of bins!",
    },
  ],
};

export const outline = (storyTitle: string): Outline => ({
  storyTitle,
  pages: [1, 2, 3, 4, 5, 6].map((page) => ({ page, beat: `beat ${String(page)}`, funnyMoment: "a joke" })),
});

export const script: PageScript = {
  page: 1,
  segments: [
    { speaker: "narrator", text: "Pip had a plan.", style: "warm" },
    { speaker: "pip", text: "To the MOON!", style: "thrilled" },
    { speaker: "narrator", text: "It was a bad plan.", style: "deadpan" },
    { speaker: "pip", text: "<giggle> A brilliant bad plan.", style: "cheeky" },
  ],
};

/** Answers each task from a queue (or a fixed value), recording every call. */
export class FakeModel implements StructuredModel {
  readonly calls: string[] = [];
  constructor(private readonly responses: Record<string, unknown[]>) {}

  generate<S extends import("zod").ZodType>(request: { task: string; schema: S }): Promise<import("zod").infer<S>> {
    this.calls.push(request.task);
    const queue = this.responses[request.task];
    if (queue === undefined || queue.length === 0) throw new Error(`FakeModel has no response for ${request.task}`);
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return Promise.resolve(request.schema.parse(next));
  }
}

export const decisions = {
  ask: { decision: "ask", reason: "no problem yet", question: "What is Pip looking for?" } satisfies ClarificationDecision,
  ready: { decision: "ready", reason: "enough", question: "" } satisfies ClarificationDecision,
};

export class FakeVoices implements VoiceDesigner {
  readonly designed: string[] = [];
  constructor(private readonly reject = false) {}
  design(request: { name: string; description: string }): Promise<{ voiceId: string; preview: Uint8Array | undefined }> {
    if (this.reject) return Promise.reject(new VoiceRejectedError("blocked by safety policies"));
    this.designed.push(request.description);
    return Promise.resolve({ voiceId: `voice_${request.name.toLowerCase()}`, preview: new Uint8Array([7]) });
  }
  fallback(gender: string, index: number): string {
    return `catalog_${gender}_${String(index)}`;
  }
}

export const fakeSpeech: SpeechSynthesizer = {
  synthesize: () => Promise.resolve({ wav: new Uint8Array([1, 2, 3]), durationMs: 1000 }),
};

export const fakeAudio: AudioStore = {
  save: (storyId, name) => Promise.resolve(`/audio/${storyId}/${name}.wav`),
};

export const silentLog: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export function deps(overrides: Partial<StoryDeps> & { model: StructuredModel }): StoryDeps {
  return {
    voices: new FakeVoices(),
    speech: fakeSpeech,
    audio: fakeAudio,
    log: silentLog,
    narratorVoiceId: "voice_narrator",
    stockVoices: {},
    voiceLibrary: {},
    ...overrides,
  };
}
