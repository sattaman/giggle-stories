// Sending the child's action (a reply, "Try again") and recovering from a lost response.

import type { StoryView } from "@storytime/domain";
import { ApiError } from "../api/story-api.ts";

/**
 * Sends `request`. A 409 means the story already moved on without us, e.g. a double tap, or
 * an earlier request whose response was lost, so `refresh` fetches what it's doing now.
 * Resolves to the view to show, or null if nothing got through (keep the current screen).
 */
export async function sendAndRefresh(
  request: () => Promise<StoryView>,
  refresh: () => Promise<StoryView>,
): Promise<StoryView | null> {
  try {
    return await request();
  } catch (error: unknown) {
    if (!(error instanceof ApiError && error.status === 409)) return null;
    try {
      return await refresh();
    } catch {
      return null;
    }
  }
}
