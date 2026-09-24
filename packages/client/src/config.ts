// Build-time configuration. Expo inlines EXPO_PUBLIC_* variables, so these must
// be read with plain `process.env.EXPO_PUBLIC_X` member access.

import { z } from "zod";

const Config = z.object({
  apiUrl: z.url().transform((url) => url.replace(/\/+$/, "")),
  mock: z.boolean(),
});
export type Config = z.infer<typeof Config>;

export const config: Config = Config.parse({
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787",
  mock: process.env.EXPO_PUBLIC_MOCK === "1",
});
