// In-memory fakes for every port, so the graph can be tested without any LLM or TTS.

import type { Cast, ClarificationDecision, Outline, PageScript, StoryBrief } from "@storytime/domain";
import {
  VoiceRejectedError,
  type AudioStore,
  type ImageStore,
  type Illustrator,
  type SceneDrawer,
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

/** Records each prompt and returns a tiny PNG. */
export class FakeIllustrator implements Illustrator {
  readonly prompts: string[] = [];
  constructor(private readonly fail = false) {}
  draw(request: { readonly prompt: string }): Promise<{ readonly image: Uint8Array; readonly type: "image/png" }> {
    this.prompts.push(request.prompt);
    if (this.fail) return Promise.reject(new Error("image model unavailable"));
    return Promise.resolve({ image: new Uint8Array([137, 80, 78, 71]), type: "image/png" });
  }
}

export const fakeImages: ImageStore = {
  save: (storyId, name) => Promise.resolve(`/images/${storyId}/${name}.png`),
  saveScene: (storyId, name) => Promise.resolve(`/images/${storyId}/${name}.svg`),
};

export const SCENE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><style>@keyframes bob{50%{transform:translateY(-6px)}}#pip{animation:bob 2s infinite}</style><g id="pip"><circle cx="400" cy="300" r="80" fill="#fa0"/></g></svg>`;

/** Records each prompt and answers with a small animated SVG (or a fixed answer). */
export class FakeSceneDrawer implements SceneDrawer {
  readonly prompts: string[] = [];
  constructor(private readonly svg: string | Error = SCENE_SVG) {}
  draw(request: { readonly prompt: string }): Promise<{ readonly svg: string }> {
    this.prompts.push(request.prompt);
    return this.svg instanceof Error ? Promise.reject(this.svg) : Promise.resolve({ svg: this.svg });
  }
}

export const silentLog: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

export function deps(overrides: Partial<StoryDeps> & { model: StructuredModel }): StoryDeps {
  return {
    voices: new FakeVoices(),
    speech: fakeSpeech,
    audio: fakeAudio,
    illustrator: new FakeIllustrator(),
    sceneDrawer: new FakeSceneDrawer(),
    images: fakeImages,
    pictures: ["painted", "animated"],
    log: silentLog,
    narratorVoiceId: "voice_narrator",
    stockVoices: {},
    voiceLibrary: {},
    ...overrides,
  };
}
