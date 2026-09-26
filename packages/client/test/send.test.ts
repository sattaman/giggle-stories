import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StoryView } from "@storytime/domain";
import { ApiError } from "../src/api/story-api.ts";
import { sendAndRefresh } from "../src/story/send.ts";

const view = (status: StoryView["status"]): StoryView => ({
  id: "story_abc",
  status,
  stage: null,
  message: null,
  idea: null,
  pending: null,
  characters: [],
  title: null,
  performance: null,
  pictures: [],
  error: null,
  canRetry: status === "error",
});

describe("sendAndRefresh", () => {
  it("shows the server's answer", async () => {
    assert.equal((await sendAndRefresh(() => Promise.resolve(view("working")), () => Promise.reject(new Error("unused"))))?.status, "working");
  });

  it("refreshes on 409, e.g. a retry whose earlier response was lost", async () => {
    const shown = await sendAndRefresh(
      () => Promise.reject(new ApiError("HTTP 409", 409)),
      () => Promise.resolve(view("working")),
    );
    assert.equal(shown?.status, "working"); // polling resumes instead of sticking on the error
  });

  it("keeps the current screen when the request doesn't get through", async () => {
    assert.equal(await sendAndRefresh(() => Promise.reject(new ApiError("offline", null)), () => Promise.resolve(view("working"))), null);
    assert.equal(await sendAndRefresh(() => Promise.reject(new ApiError("HTTP 409", 409)), () => Promise.reject(new ApiError("offline", null))), null);
  });
});
