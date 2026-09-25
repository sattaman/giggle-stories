// "My stories": which stories to show and how, as pure functions.

import type { StorySummary } from "@storytime/domain";

export interface LibraryEntry {
  readonly id: string;
  readonly title: string;
  readonly characters: StorySummary["characters"];
  readonly dateLabel: string;
  /** Finished (or still being voiced): ready to play. Unfinished: stopped at a question or the plan, or still being made. */
  readonly state: "playable" | "unfinished";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Stories to list, most recent first. Broken ones are hidden: there's nothing to play. */
export function libraryEntries(stories: readonly StorySummary[], now: Date): LibraryEntry[] {
  return stories
    .filter((story) => story.status !== "error")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((story) => ({
      id: story.id,
      title: storyTitle(story),
      characters: story.characters,
      dateLabel: storyDate(story.createdAt, now),
      state: story.status === "done" || story.status === "performing" ? "playable" : "unfinished",
    }));
}

function storyTitle(story: StorySummary): string {
  const title = story.title?.trim() ?? "";
  if (title !== "") return title;
  const idea = story.idea.trim();
  if (idea === "") return "A new story";
  return idea.length > 60 ? `${idea.slice(0, 57).trimEnd()}…` : idea;
}

/** "Today", "Yesterday", or e.g. "24 September" (plus the year if it isn't this year), in local time. */
export function storyDate(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const dayMonth = `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ""}`;
  return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${String(date.getFullYear())}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
