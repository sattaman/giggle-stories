import type { StoryView } from "@storytime/domain";
import { describe, expect, it } from "vitest";
import { buildHttp } from "../src/http.ts";
import { StoryConflictError, StoryNotFoundError, type StoryService } from "../src/story-service.ts";
import { buildView, idleProgress, type PersistedStory } from "../src/view.ts";

const script = {
  page: 1,
  segments: [
    { speaker: "narrator", text: "Once.", style: "warm" },
    { speaker: "pip", text: "Hi!", style: "excited" },
  ],
};

const empty: PersistedStory = { idea: "a rocket", cast: [], performance: [] };

describe("buildView", () => {
  it("is 'working' with a friendly message while busy", () => {
    const view = buildView({
      id: "story_1",
      state: empty,
      pending: undefined,
      progress: { ...idleProgress, busy: true, stage: "casting", message: "Giving everyone a voice…" },
    });
    expect(view).toMatchObject({ status: "working", stage: "casting", message: "Giving everyone a voice…" });
  });

  it("is 'waiting' with the question when the graph is interrupted", () => {
    const pending = { kind: "clarification", question: "Friendly or grumpy?", questionAudioUrl: null, round: 1 };
    const view = buildView({ id: "story_1", state: empty, pending, progress: idleProgress });
    expect(view).toMatchObject({ status: "waiting", pending });
  });

  it("streams performed segments while performing, then is 'done'", () => {
    const performed = new Map([[0, { audioUrl: "http://a/0.wav", durationMs: 900 }]]);
    const performing = buildView({
      id: "story_1",
      state: { ...empty, script },
      pending: undefined,
      progress: { ...idleProgress, busy: true, stage: "performing", message: "…", performed },
    });
    expect(performing.status).toBe("performing");
    expect(performing.performance?.segments.map((s) => s.audioUrl)).toEqual(["http://a/0.wav", null]);

    const performance = script.segments.map((s, index) => ({ ...s, index, audioUrl: `http://a/${String(index)}.wav`, durationMs: 1 }));
    const done = buildView({ id: "story_1", state: { ...empty, script, performance }, pending: undefined, progress: idleProgress });
    expect(done.status).toBe("done");
    expect(done.performance?.complete).toBe(true);
  });

  it("reports a friendly error for a run that died", () => {
    const view = buildView({ id: "story_1", state: empty, pending: undefined, progress: idleProgress });
    expect(view.status).toBe("error");
  });
});

describe("http", () => {
  const view: StoryView = {
    id: "story_abc",
    status: "working",
    stage: "understanding",
    message: "Thinking…",
    idea: "a rocket",
    pending: null,
    characters: [],
    title: null,
    performance: null,
    error: null,
  };
  const stories: StoryService = {
    start: () => Promise.resolve(view),
    view: (id) => (id === "story_abc" ? Promise.resolve(view) : Promise.reject(new StoryNotFoundError(id))),
    reply: () => Promise.reject(new StoryConflictError("Story isn't waiting for a reply")),
  };
  const app = () =>
    buildHttp({
      stories,
      transcriber: { transcribe: () => Promise.resolve("hello") },
      audioPath: () => undefined,
      logger: false,
    });

  it("starts a story", async () => {
    const res = await (await app()).inject({ method: "POST", url: "/v1/stories", payload: { idea: "a rocket" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "story_abc" });
  });

  it("validates bodies and ids", async () => {
    const server = await app();
    expect((await server.inject({ method: "POST", url: "/v1/stories", payload: { idea: "" } })).statusCode).toBe(400);
    expect((await server.inject({ method: "GET", url: "/v1/stories/story_missing" })).statusCode).toBe(404);
    expect((await server.inject({ method: "GET", url: "/v1/stories/../../etc" })).statusCode).toBe(404);
  });

  it("returns 409 when replying out of turn", async () => {
    const res = await (await app()).inject({
      method: "POST",
      url: "/v1/stories/story_abc/replies",
      payload: { kind: "answer", text: "grumpy" },
    });
    expect(res.statusCode).toBe(409);
  });
});
