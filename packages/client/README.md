# @storytime/client

The child-facing Storytime app (Expo Router; web now, iOS/Android later).

- `pnpm --filter @storytime/client web:mock`: web dev server against the in-memory mock API (no server needed; silent audio, timer-driven).
- `pnpm --filter @storytime/client web`: web dev server against the real API at `EXPO_PUBLIC_API_URL` (default `http://localhost:8787`).
- `pnpm --filter @storytime/client typecheck` / `test`.

Layout: `src/app/` screens, `src/components/` UI, `src/api/` the `StoryApi` port with HTTP and mock adapters,
`src/story/` and `src/speech/` pure state machines plus the hooks that drive them, `src/audio/` expo-audio wrappers.
