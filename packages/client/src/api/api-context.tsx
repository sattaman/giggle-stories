// Composition root for the client: picks the StoryApi adapter once and hands it
// to screens through context, so screens never know which one they're using.

import { createContext, useContext, useState, type ReactNode } from "react";
import { config } from "../config.ts";
import { createHttpStoryApi } from "./http-story-api.ts";
import { createMockStoryApi } from "./mock-story-api.ts";
import type { StoryApi } from "./story-api.ts";

const StoryApiContext = createContext<StoryApi | null>(null);

export function StoryApiProvider({ children, api }: { readonly children: ReactNode; readonly api?: StoryApi }) {
  const [value] = useState<StoryApi>(() => api ?? (config.mock ? createMockStoryApi() : createHttpStoryApi(config.apiUrl)));
  return <StoryApiContext value={value}>{children}</StoryApiContext>;
}

export function useStoryApi(): StoryApi {
  const api = useContext(StoryApiContext);
  if (api === null) throw new Error("useStoryApi must be used inside <StoryApiProvider>");
  return api;
}
