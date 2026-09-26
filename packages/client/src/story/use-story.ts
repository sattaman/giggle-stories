// Keeps one story's view fresh: polls while the server is busy (backing off
// when the network wobbles) and sends the child's replies.

import type { ReplyBody, StoryView } from "@storytime/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type StoryApi } from "../api/story-api.ts";
import { pollDelayMs, shouldPoll } from "./flow.ts";
import { sendAndRefresh } from "./send.ts";

/** After this many failed polls in a row we tell the child we're reconnecting. */
const RECONNECTING_AFTER_FAILURES = 2;

export type StoryLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly view: StoryView }
  | { readonly kind: "missing" };

export interface StorySession {
  readonly load: StoryLoad;
  readonly reconnecting: boolean;
  /** Sends a reply. Resolves false (and keeps the current screen) if it didn't get through. */
  readonly reply: (body: ReplyBody) => Promise<boolean>;
  /** Carries on a story that stopped part-way. Resolves false if it didn't get through. */
  readonly retry: () => Promise<boolean>;
}

export function useStory(api: StoryApi, id: string): StorySession {
  const [load, setLoad] = useState<StoryLoad>({ kind: "loading" });
  const [failures, setFailures] = useState(0);
  const latest = useRef<StoryView | null>(null);

  const accept = useCallback((view: StoryView) => {
    latest.current = view;
    setLoad({ kind: "ready", view });
    setFailures(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;

    const tick = async (): Promise<void> => {
      if (shouldPoll(latest.current)) {
        try {
          const view = await api.get(id);
          if (cancelled) return;
          consecutiveFailures = 0;
          accept(view);
        } catch (error: unknown) {
          if (cancelled) return;
          if (error instanceof ApiError && error.status === 404) {
            setLoad({ kind: "missing" });
            return;
          }
          consecutiveFailures += 1;
          setFailures(consecutiveFailures);
        }
      }
      timer = setTimeout(() => void tick(), pollDelayMs(consecutiveFailures));
    };

    latest.current = null;
    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [api, id, accept]);

  const send = useCallback(
    async (request: () => Promise<StoryView>): Promise<boolean> => {
      const view = await sendAndRefresh(request, () => api.get(id));
      if (view !== null) accept(view);
      return view !== null;
    },
    [api, id, accept],
  );
  const reply = useCallback((body: ReplyBody) => send(() => api.reply(id, body)), [api, id, send]);
  const retry = useCallback(() => send(() => api.retry(id)), [api, id, send]);

  return { load, reconnecting: failures >= RECONNECTING_AFTER_FAILURES, reply, retry };
}
