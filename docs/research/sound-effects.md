# Sound effects (SFX): research and plan

_Researched 2026-09-25. Plan only, no code yet. ⚠ = not verified against an official source._

**Goal:** short non-speech sounds at the right moment in a story (a little dog bark), plus UI sounds while the book is being made (sparkle, page turn, whoosh). Gemini TTS does not do environmental SFX, so the sounds must come from somewhere else.

## 1. Where the sounds can come from

### Generative APIs

| Option | Cost | Licence | API / limits | Verdict |
|---|---|---|---|---|
| **ElevenLabs Sound Effects** (`eleven_text_to_sound_v2`) | API page: **$0.12/min**. Docs: **40 credits/s** with a set duration, or 100 credits when the model picks the length. A 2 s bark costs ≈ $0.004–0.01 ⚠ (the two pages differ on how it's billed) | Paid plans include a commercial licence. The free plan is non-commercial and requires attribution | `POST /v1/sound-generation` `{text, duration_seconds 0.5–30, prompt_influence, loop}` → MP3/PCM/Opus. Latency not published ⚠ | **Best on-demand option**, for later |
| Google **Lyria 3 Clip / 3.5** (the Gemini key we already have) | $0.04 per 30 s clip / $0.08 per song, paid tier only | SynthID watermark | Music only. Clips are a fixed 30 s. No SFX endpoint in the Gemini API docs. Veo's audio only comes attached to a video | ✗ not suitable |
| Stability **Stable Audio 2.5** | ≈ $0.20 per generation ⚠ (third-party figure; the official page didn't render) | Stability licence ⚠ | Music and SFX. Also on fal/Replicate | ✗ about 20–50× dearer than ElevenLabs |

### Libraries

| Source | Licence | In-app redistribution | API | Verdict |
|---|---|---|---|---|
| **Kenney.nl** (Interface Sounds, UI Audio, Impact, Digital, RPG Audio) | **CC0** | ✓ (don't use the Kenney logo) | none (zip downloads) | **UI sounds.** No animal sounds |
| **Freesound** (website, hand-picked) | Per sound: **CC0** / CC-BY / CC-BY-NC | CC0 ✓. CC-BY ✓ with credits. **Avoid NC** | – | **Story sounds** (animals, doors, splashes) |
| Freesound **API** | same | – | A token is enough for search and MP3/OGG previews. **Original files need OAuth2**. Limits: 60/min, 2000/day. **Commercial use needs a negotiated licence with UPF.** Copies must be "deleted when no longer required" | ✗ at runtime: its caching and commercial terms conflict with our use |
| **Sonniss #GameAudioGDC** | Royalty-free, commercial, no attribution. Licence v2.0 from 27 Aug 2026 | ✓ inside a finished product. ✗ as a "library/asset pack/SDK". **No AI training** | none (bulk download, many GB) | Good backup for high-quality pro sounds |
| Pixabay SFX | Free, commercial, no attribution. No standalone redistribution | ✓ inside an app | **API covers images and video only**, not audio | Manual picks only |
| BBC Sound Effects (RemArc) | **Personal, educational and research use only.** Commercial use means buying a licence | ✗ in a published app | – | ✗ (fine for home tinkering only) |
| Zapsplat | Free plan needs an attribution credit. Gold removes it for good | ✓ apps and games ⚠ (licence page returned 403, so this is from secondary sources) | – | Possible, but the credit line is a hassle |
| OpenGameArt | Mixed (CC0 / CC-BY / GPL) per item ⚠ | Filter to CC0 | – | Extras only |

## 2. Recommendation

**POC (this week): a bundled, curated CC0 library with no generation.**
- About **40 story cues**, chosen by hand from Freesound, CC0 only: animals, doors, magic, water, footsteps, cartoon boings/slides, vehicles, weather (gentle), laughs/cheers, eating/burps.
- About **8 UI sounds** from Kenney.
- The parent listens to every file once before it goes in.
- **Cost: $0 per story.** Effort: about half a day to curate and normalise, plus about 1.5 days of code.

**Later: the library plus ElevenLabs generation for cues it doesn't have, cached by normalised prompt.**
- About **$0.005 per new sound** ⚠. Most cues hit the cache, so a story costs roughly **$0–0.03**.
- Use pay-as-you-go or the $6/mo Starter plan. The free plan isn't allowed in anything published.
- Setup: about 1 day.

## 3. Design sketch

### Domain (`story.ts`): an SFX is just another segment

The LLM schema stays flat and unchanged. We reserve the speaker id **`"sfx"`**:

| field | speech segment | sfx segment |
|---|---|---|
| `speaker` | narrator / character id | `"sfx"` |
| `text` | spoken words | **cue id from the catalogue**, e.g. `dog-bark-small` |
| `style` | acting note | short description, e.g. "one tiny yappy bark". Used later as the generation prompt |

This design:
- **Reuses the whole pipeline.** The client queue already plays segments in order, so an SFX is simply a segment whose `audioUrl` points at a library file.
- **Avoids unions.** A separate `kind` field would force the LLM to fill in unused fields.

What else changes:
- `SpeakerId` accepts `"sfx"`. Casting must never create a character with id `sfx`: `slugify` has to avoid it.
- `scriptProblems` skips the stage-direction and "no spoken words" checks for sfx segments.
- A new pure `trimSoundEffects(script, max)` function:
  - keeps at most **3 SFX per page** (2 for ages 0–4);
  - allows no two SFX in a row;
  - allows none as the first segment, so the first line is always speech.
- New `SfxCue` schema: a catalogue entry `{id, description, tags, durationMs, file}`.
- **Ambience beds and overlapping sounds are out of scope.** They need start/end timing and mixing. Revisit once inline cues are proven.

### Writer prompt (`WRITE_PAGE`)

Add to the prompt:
- The cue catalogue (id and one-line description).
- The rules:
  - "Optionally add a sound effect as its own segment: speaker "sfx", text = a cue id from SOUNDS, style = what it sounds like."
  - "Use one only when something audible happens right then (the dog barks, a door creaks). It never replaces a punchline, and it never goes in the middle of a character's sentence."
  - "At most 3 per page (AUDIENCE may lower this). Nothing scary: no screams, weapons, monsters roaring, crashes or thunder for under-5s."
  - "If no cue fits, leave it out."

### App

A new port, with adapters and a fake:

```ts
interface SoundEffectLibrary {
  catalogue(): readonly SfxCue[];                          // for the prompt
  resolve(cue: string, description: string): Promise<{ url: string; durationMs: number } | null>;
}
```

- **`StaticSfxLibrary`** (the POC adapter) reads `assets/sfx/manifest.json`. `resolve` is a map lookup. An unknown cue returns `null`.
- **`CachedGeneratingSfxLibrary`** (later) tries the static library first. If that misses, it looks up `sha256(normalised description)` in the cache. Only if that misses too does it call ElevenLabs (`duration_seconds` ≤ 3, `prompt_influence` 0.5). It saves the result to `DATA_DIR/sfx-cache/` and logs the new cue for the parent to review in `/debug`.
- **`performPage`**:
  - Resolves every sfx segment **first**. With the static adapter this is synchronous in practice.
  - **Drops unresolved sfx segments before assigning indices**, so the client never waits on a gap.
  - Sends library sounds straight to `segmentPerformed`.
  - TTS then carries on exactly as it does today.
  - With generation, the SFX calls run in parallel with the TTS and each has a **timeout** of about 4 s ⚠. On timeout, drop the SFX.
- **Server**: add `GET /v1/sfx/:file`. It is immutable, with a content type chosen from the file extension. The existing audio route hard-codes `audio/wav`.

### Client

- **Story SFX** play inline through the existing queue, which needs no changes. The UI shows a small 🔊 chip instead of a speech bubble when `speaker === "sfx"`.
- **Creation sounds** are bundled with `require("../../assets/ui/sparkle.mp3")` and preloaded at module scope (the expo-audio docs cover `preload`). Use `createAudioPlayer`: it allows several players at once. Events that get a sound:
  - a character card appears → sparkle;
  - the outline is shown → page-turn;
  - "Yes!" → whoosh.
  - **Mute UI sounds while the story is playing.**
- **Web autoplay:** every UI sound follows a tap, and the story already starts from a "tap to play". The one exception is a sound triggered by server progress (for example, cards arriving while she waits). It works only after the first gesture, so skip it before then.
- **Native:** `setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" })`, which are the defaults.
- Add a parent setting "Sound effects on/off", stored locally.

### Latency

- Library cues add no latency.
- The first segment is always speech, so the time until the first line is heard is unchanged.
- Generated cues are never on the critical path: they have a timeout, then they are dropped.

## 4. Risks

| Risk | Mitigation |
|---|---|
| Licensing | CC0 only in the POC. Keep `assets/sfx/LICENSES.md` recording source URL, author and licence per file. No BBC, no NC, no Freesound API at runtime. ElevenLabs only on a paid plan |
| Scary or loud sounds for ages 0–4 | Parent approves every file. Tag each cue `gentle` or `lively`: 0–4 gets only `gentle`. Soft attack, peak ≤ −3 dBFS. Generated sounds go into a review queue and aren't reused until approved (later) |
| Loudness mismatch with TTS | Measure a few TTS WAVs (`ffmpeg -af ebur128`). Normalise the library about 3 dB quieter than speech (a script around `loudnorm`, target ≈ −19 LUFS ⚠ once TTS is measured). Integrated LUFS is unreliable under about 3 s, so for short cues check short-term loudness or peak as well |
| Formats | Ship **MP3** (44.1 kHz mono, 128 kbps): it plays on web, iOS and Android. Avoid OGG (weak iOS support ⚠). WAV is fine but big |
| Overuse / hammy | Cap enforced in code. Add an eval judge later ("did the SFX help or distract?"). Watch her reaction in play sessions |
| Storage | The library is about 1–3 MB in the repo. The generation cache sits in `DATA_DIR`, keyed by hash, and never expires (it is tiny) |

## 5. Step-by-step plan (each step is testable on its own)

1. **Domain + static library + performPage** (5 placeholder CC0 cues). Unit tests: the schema, `trimSoundEffects`, resolve/drop in `performPage` with a fake library, and the `/v1/sfx` route.
2. **Writer prompt + catalogue.** Live check: one script contains 0–3 valid cues. LangSmith trace review.
3. **Client:** the 🔊 chip, and the queue plays the sfx URL (test the reducer with a mixed track).
4. **Curate the real library** (about 40 cues) with a `scripts/normalise-sfx.ts` ffmpeg script and `LICENSES.md`. The parent listens to each one.
5. **UI creation sounds** (Kenney) with preload, mute during the story, and the parent toggle.
6. **ElevenLabs fallback** behind the port: cache, timeout, review queue, budget guard (a daily cap on new generations).
7. **Eval:** an "SFX appropriate and not overused" judge on the page-script dataset.

## 6. Prompt for a coding agent (step 1)

> Read `CLAUDE.md`, `docs/research/sound-effects.md` §3, `packages/domain/src/story.ts`, `packages/domain/src/invariants.ts`, `packages/app/src/ports.ts`, `packages/app/src/graph/story-graph.ts` (`performPage`) and `packages/server/src/http.ts`. Implement step 1 of the SFX plan, and **only step 1**:
> 1. Domain:
>    - Add `SFX = "sfx"` and let `SpeakerId` accept it.
>    - Make sure `slugify`/casting can never produce the id `sfx`.
>    - Add an `SfxCue` zod schema `{id (kebab), description, tags: string[], durationMs, file}`.
>    - In `scriptProblems`, exempt sfx segments from the stage-direction and no-words checks, and flag an sfx segment whose text isn't kebab-case.
>    - Add a pure `trimSoundEffects(script, max)`: at most `max` sfx segments, never first, never two in a row. Keep the LLM schema flat: no unions.
> 2. App: add the `SoundEffectLibrary` port (`catalogue()`, `resolve(cue, description)` → `{url, durationMs} | null`) to `StoryDeps`, plus a `FakeSoundEffectLibrary`. In `performPage`:
>    - apply `trimSoundEffects(script, 3)`;
>    - resolve sfx segments first;
>    - **drop unresolved ones before indices are assigned**;
>    - report resolved ones via `progress.segmentPerformed` without calling TTS;
>    - leave speech handling unchanged.
> 3. Adapters: add `StaticSfxLibrary`, which reads `assets/sfx/manifest.json` (validated with zod) and builds URLs under `${publicUrl}/v1/sfx/`. Add 5 CC0 placeholder MP3s (e.g. from Kenney) and list them in `assets/sfx/LICENSES.md`.
> 4. Server: wire the adapter in `main.ts`. Add `GET /v1/sfx/:file`: whitelist names from the manifest, set `audio/mpeg` or `audio/wav` from the extension, immutable cache.
> 5. Tests (vitest), for each of: the schema, the trimming rules, `performPage` with the fake (resolved, dropped, indices contiguous, TTS never called for sfx), and the route (404 for unknown files).
>
> Don't change prompts or the client yet. Follow strict TS rules (no `as`, `!` or `any`). Run `pnpm check` until it passes. Don't commit.

## Sources
- ElevenLabs SFX API: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- ElevenLabs SFX capability and credits: https://elevenlabs.io/docs/overview/capabilities/sound-effects
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api
- ElevenLabs free-plan licensing: https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform (⚠ from the search summary)
- Gemini pricing (Lyria, TTS): https://ai.google.dev/gemini-api/docs/pricing
- Lyria docs: https://ai.google.dev/gemini-api/docs/music-generation
- Stable Audio: https://platform.stability.ai/pricing (⚠ didn't render); https://github.com/api-evangelist/stability-audio
- Freesound API auth: https://freesound.org/docs/api/overview.html
- Freesound API resources: https://freesound.org/docs/api/resources_apiv2.html
- Freesound API terms: https://freesound.org/help/tos_api/
- Kenney: https://kenney.nl/support
- Kenney audio packs: https://kenney.nl/assets/category:Audio
- Sonniss licence: https://sonniss.com/gdc-bundle-license/
- Pixabay licence: https://pixabay.com/service/license-summary/
- Pixabay API: https://pixabay.com/api/docs/
- BBC RemArc: https://sound-effects.bbcrewind.co.uk/licensing (⚠ blocked; via https://www.avosound.com/en-us/licensing/remarc-license)
- Zapsplat: https://www.zapsplat.com/license-type/standard-license/ (⚠ 403)
- expo-audio: https://docs.expo.dev/versions/latest/sdk/audio/
