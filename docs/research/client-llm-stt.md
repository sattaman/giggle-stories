# Expo client, OpenRouter, Gemini STT, SQLite: verified 2026-09-24

## Expo
- **Versions:** expo 57.0.25, create-expo-app 5.0.0, expo-router 57.0.23, react 19.2.3, react-native 0.86.3, react-native-web ~0.21.0, expo-audio ~57.0.5.
- **Create:** `pnpm create expo-app@5.0.0 apps/client --template default@sdk-57 --no-agents-md`. The code lives in `src/app/`.
- **pnpm:** isolated installs work without config (SDK 54+). Keep the `minimumReleaseAgeExclude` list it writes to pnpm-workspace.yaml.
- **Web:** `expo start --web --port N`. `web.output: "static"` pre-renders in Node, so don't touch `window` at module scope.

## expo-audio
- **Before each recording:** call `prepareToRecordAsync()`; on web the recorder resets after `stop()`.
- **Web recording:** `recorder.uri` is a blob: URL. `fetch(uri).blob()` gives the audio; send `blob.type` as the mime type (Chrome records webm/opus).
- **Native recording:** AAC .m4a.
- **Playback:** `useAudioPlayer`, `replace({uri})`, `play()`. On web it uses `new Audio()`, and `didJustFinish` comes from the pause-before-ended event (not browser-tested).
- **Autoplay:** browsers may block `play()` after awaits, so keep a Play button as a fallback.

## OpenRouter
Slugs (price $/M tokens in/out; all support structured outputs):
- `anthropic/claude-sonnet-5`: 2 / 10
- `anthropic/claude-haiku-4.5`: 1 / 5
- `google/gemini-3.8-flash`: 0.75 / 3.75
- `openai/gpt-5.4-mini`: 0.75 / 4.5
- `openai/gpt-6-luna`: 0.1 / 0.5

**@langchain/openrouter 0.4.13 `withStructuredOutput`:** method detection uses a bundled model table. For models not in it, the default is functionCalling (fine); explicit `method: "jsonSchema"` throws.

## Gemini STT
- **Model:** `gemini-3.5-transcribe`, inline base64 via `ai.interactions.create({ input: [{type:"audio", data, mime_type}] , generation_config: { transcription_config: { language_codes: ["en"], mode: "smart" } } })`, then read `output_text`.
- **Formats that worked (live-tested):** wav, webm, webm;codecs=opus, m4a, mp4.

## SQLite checkpointer
- **Dependency:** better-sqlite3 12.11.1 (prebuilt for Node 22 arm64).
- **pnpm 11:** needs `allowBuilds: { better-sqlite3: true }`.
