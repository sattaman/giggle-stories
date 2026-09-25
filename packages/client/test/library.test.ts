import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StorySummary } from "@storytime/domain";
import { libraryEntries, storyDate } from "../src/story/library.ts";

const now = new Date(2026, 8, 25, 10, 0);

function summary(id: string, status: StorySummary["status"], createdAt: Date, title: string | null = `Story ${id}`): StorySummary {
  return {
    id,
    title,
    idea: "A duck who is a pirate and is scared of cheese, and also of the dark, and of very loud seagulls",
    ageBand: "5-8",
    createdAt: createdAt.toISOString(),
    status,
    characters: [{ name: "Captain Crumbs", emoji: "🦆", colour: "#FFB020" }],
    voicedLines: 8,
    totalLines: 8,
  };
}

describe("my stories", () => {
  it("hides broken stories, sorts newest first and marks unfinished ones", () => {
    const entries = libraryEntries(
      [
        summary("old", "done", new Date(2026, 8, 20)),
        summary("broken", "error", new Date(2026, 8, 25, 9)),
        summary("new", "waiting", new Date(2026, 8, 25, 8)),
        summary("making", "working", new Date(2026, 8, 24)),
        summary("voicing", "performing", new Date(2026, 8, 23)),
      ],
      now,
    );
    assert.deepEqual(
      entries.map((e) => [e.id, e.state, e.dateLabel]),
      [
        ["new", "unfinished", "Today"],
        ["making", "unfinished", "Yesterday"],
        ["voicing", "playable", "23 September"],
        ["old", "playable", "20 September"],
      ],
    );
  });

  it("falls back to the idea when there's no title yet", () => {
    const [entry] = libraryEntries([summary("x", "working", now, null)], now);
    assert.equal(entry?.title, "A duck who is a pirate and is scared of cheese, and also…");
    const [short] = libraryEntries([{ ...summary("y", "working", now, "  "), idea: "A frog" }], now);
    assert.equal(short?.title, "A frog");
  });

  it("dates older stories with the year when it isn't this year", () => {
    assert.equal(storyDate(new Date(2025, 11, 31, 12).toISOString(), now), "31 December 2025");
    assert.equal(storyDate("not a date", now), "");
  });
});
