// StoryApi over the /v1 HTTP contract. Every response is validated with the
// domain's zod schemas before it reaches the UI.

import {
  NarrationClips,
  ReplyBody,
  StartStoryBody,
  StoryList,
  StoryView,
  TranscriptionResult,
  type AgeBand,
  type StorySummary,
} from "@storytime/domain";
import type { z } from "zod";
import { ApiError, type AudioUpload, type StoryApi } from "./story-api.ts";

const JSON_TIMEOUT_MS = 20_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

export function createHttpStoryApi(baseUrl: string): StoryApi {
  async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (error: unknown) {
      throw new ApiError(error instanceof Error ? error.message : "Network error", null);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new ApiError(`HTTP ${String(response.status)} for ${path}`, response.status);
    }
    const body: unknown = await response.json();
    return schema.parse(body);
  }

  function postJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    return request(
      path,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      schema,
      JSON_TIMEOUT_MS,
    );
  }

  return {
    async transcribe(audio: AudioUpload, storyId?: string): Promise<string> {
      const form = new FormData();
      appendAudio(form, audio);
      const path = storyId === undefined ? "/v1/transcriptions" : `/v1/transcriptions?storyId=${encodeURIComponent(storyId)}`;
      const result = await request(path, { method: "POST", body: form }, TranscriptionResult, TRANSCRIBE_TIMEOUT_MS);
      return result.text.trim();
    },
    start(idea: string, ageBand: AgeBand): Promise<StoryView> {
      return postJson("/v1/stories", StartStoryBody.parse({ idea, ageBand }), StoryView);
    },
    get(id: string): Promise<StoryView> {
      return request(`/v1/stories/${encodeURIComponent(id)}`, { method: "GET" }, StoryView, JSON_TIMEOUT_MS);
    },
    reply(id: string, body: ReplyBody): Promise<StoryView> {
      return postJson(`/v1/stories/${encodeURIComponent(id)}/replies`, ReplyBody.parse(body), StoryView);
    },
    retry(id: string): Promise<StoryView> {
      return postJson(`/v1/stories/${encodeURIComponent(id)}/retry`, {}, StoryView);
    },
    async listStories(): Promise<StorySummary[]> {
      const list = await request("/v1/stories", { method: "GET" }, StoryList, JSON_TIMEOUT_MS);
      return list.stories;
    },
    narration(): Promise<NarrationClips> {
      return request("/v1/narration", { method: "GET" }, NarrationClips, JSON_TIMEOUT_MS);
    },
  };
}

function appendAudio(form: FormData, audio: AudioUpload): void {
  switch (audio.kind) {
    case "blob":
      form.append("audio", audio.blob, audio.filename);
      return;
    case "file":
      // React Native streams { uri, name, type } from disk (see react-native-formdata.d.ts).
      form.append("audio", { uri: audio.uri, name: audio.name, type: audio.type });
      return;
  }
}
