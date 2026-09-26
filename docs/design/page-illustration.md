# Page illustration: approach (for review)

Storytime turns a young child's spoken idea into a short, funny story. A narrator and character voices perform it aloud; the child listens on a tablet or laptop. This feature adds **one picture per page**. It should be **appealing to children aged 0–12** and **match the page they are hearing**. Today only page 1 is performed; later, stories will have up to 6 pages.

Stack: TypeScript, LangGraph.js for the story workflow, OpenRouter for text and image models, Gemini for speech, and an Expo (React Native / web) client.

## Goals and constraints

1. **Appeal:** warm, funny, picture-book art that a child enjoys looking at.
2. **Match the text:** show the moment on the page the child is hearing, with characters as she described them.
3. **Don't add waiting.** The child already waits about 6 s after approving the plan for the first line of audio.
4. **Cost:** a personal project on prepaid credit; we aim for pennies per story.
5. **Graceful failure:** the story must work without a picture.
6. **Swappable provider:** changing the model or provider is configuration, not code.
7. **Privacy:** only story content goes into prompts (first names only, never real personal details).

## When the picture is drawn

```text
idea → (0–2 questions) → cast → outline + page 1 script → child reviews the plan
                                                   │
                                  "Yes!" ──────────┼──► perform page 1 (TTS, lines play as they're ready)
                                                   └──► draw picture (in parallel)
```

- The picture is drawn **after the child approves** the plan, **in parallel with** the audio performance.
- It uses the **approved page script**, not the outline, so it matches what she hears. Nothing is drawn for plans she then changes.
- **Trade-off:** there is no picture on the plan-review screen. The picture appears about 12 s after "Yes!". The first line of audio is already playing by then, and the picture fades in during the page.
- Rejected alternative: drawing from outline beat 1 while the page is written, so the picture could appear on the plan screen with no wait. It matched the page less closely, and would draw pictures for plans that get changed.

## How the prompt is built

The prompt is a template filled from the story itself, with **no extra LLM call**. Parts:

1. **Fixed house style** (the same every time, for a consistent look):
   > A warm, funny children's picture-book illustration in soft watercolour and ink. Bright, friendly colours, expressive cartoon characters with big readable faces, a clear focal point. Gentle and safe for young children; nothing frightening, gory or realistic-photo. Landscape composition with room around the characters. Absolutely no text, letters, words, numbers or speech bubbles in the image.
2. **Mood by age band:**
   - 0–4: "Very simple shapes, a few big characters, soft rounded forms, cosy and bright."
   - 5–8: "Lively and playful, a little visual joke in the background."
   - 9–12: "More detailed scene with a sense of adventure, still cartoon-styled."
3. **Story premise and setting** from the story brief.
4. **Characters:** each with the child's own words about them (species, colour, clothes), plus their personality.
5. **The page itself:** "Draw the single funniest or most exciting moment of this page", followed by the page's lines as spoken. Vocal-performance tags such as `<giggle>` are removed.

### Real example (the prompt that produced the test picture)

```text
A warm, funny children's picture-book illustration in soft watercolour and ink. Bright, friendly colours, expressive cartoon characters with big readable faces, a clear focal point. Gentle and safe for young children; nothing frightening, gory or realistic-photo. Landscape composition with room around the characters. Absolutely no text, letters, words, numbers or speech bubbles in the image.
Lively and playful, a little visual joke in the background.
Story: Biscuit the hamster dreams of becoming a famous chef, but he is scared of spoons.
Setting: a tiny kitchen made from a shoebox.
Characters (draw each exactly as described, and the same way every time):
- Biscuit 🐹: a fluffy golden hamster who wears a tiny chef hat; proud, dramatic, secretly nervous
Draw the single funniest or most exciting moment of this page, with the characters in it:
Narrator: His kitchen was a shoebox. His oven was a warm patch of sunshine.
Narrator: He reached for a spoon to stir. Then he saw it: long, shiny, and reflecting his own worried face.
Biscuit: A spoon! The rival chef has arrived!
Narrator: Biscuit leapt behind the nearest hiding place. It was a single raisin.
Biscuit: Stay close, brave raisin. I may need your raisinous protection.
```

**Result:** a golden hamster in a chef's hat hiding behind a raisin in a shoebox kitchen, with a sunlit "oven" and his worried face reflected in the spoon. Watercolour style, no text in the image. It matched the page very closely.

## Model and API

- **API:** OpenRouter's Images API (`POST /api/v1/images`). Request: `{ model, prompt, n: 1, aspect_ratio: "4:3", resolution: "1K" }`. Response: base64 image plus `media_type`, and `usage.cost` in USD, which we log for every picture.
- **Model:** `google/gemini-3.1-flash-image` by default. Any OpenRouter image model can be chosen with one environment variable, `STORY_IMAGE_MODEL`. Other candidates:
  - `google/gemini-3-pro-image`
  - `openai/gpt-5.4-image-2`
  - `openai/gpt-5-image-mini`
  - `google/gemini-3.1-flash-lite-image`
- LangChain's OpenRouter chat model doesn't support image output, so the adapter calls the API directly and validates the response with zod.

## Measured (one live picture)

| | |
| --- | --- |
| Time | 12.1 s |
| Cost reported by OpenRouter | **$0.068** (we had estimated about $0.004 from per-token list prices) |
| Output | 1200 × 896 PNG, **1.9 MB** |

**Why so big:** PNG is lossless, and watercolour texture (paper grain, soft gradients) compresses poorly. The same image re-encoded:
- JPEG, quality 85, same size: 465 KB
- JPEG, quality 85, 1024 wide: 309 KB

## Reliability and failure handling

- The image call runs as a **durable LangGraph task**, so if the run is retried or resumed, a finished picture is restored rather than paid for twice.
- A failure (API error, bad response) is **tolerated**: it's logged, and the story continues with no picture.
- A **120 s node timeout** cancels a hung request.
- The picture is saved to local storage and served from `/v1/images/<story>/page-1-picture.png`, cached forever. Each page's file name is fixed, so a replay reuses the file.

## Client presentation

- The picture sits under the story title, in a white frame with rounded corners and a soft shadow (like a picture-book plate), above the row of characters and the speech bubble.
- While it's being drawn, a frame of the same size shows "🎨 Drawing your picture…", so the layout doesn't jump. The picture fades in when loaded. If there's no picture, there's no frame.

## Known gaps and questions for review

1. **Cost:** $0.068 per picture is about 17× our estimate. Would a lower resolution (`512`), a cheaper model, or a different provider (e.g. an SDXL- or Flux-style model) keep appeal at a fraction of the price? Is a cost per picture reported by OpenRouter trustworthy for budgeting?
2. **File size:** request `output_format: "jpeg"` or `"webp"` from the API (untested), or re-encode on our server? What resolution is sensible for tablet display?
3. **Character consistency across pages:** once there are 6 pages, the hamster must look the same on every page. Options:
   - a detailed written character sheet reused in every prompt
   - generating a reference image once and passing it to later pages (image-to-image or reference input)
   - a fixed seed

   Which works best with these models?
4. **Prompt quality:** is sending the whole page's lines better than asking an LLM to pick one visual moment and describe the shot? The latter costs a small text call and about 1–2 s more. Is the house-style wording effective, or would short style keywords work better?
5. **Safety:** is "gentle and safe for young children" enough, or should we add explicit negative guidance for the spooky story type, and an image moderation check?
6. **Latency:** about 12 s. Could we start drawing before approval (for example, from the draft page while the child reviews the plan) and discard the picture if she changes the plan? Is the wasted cost worth the earlier picture?
7. **Terms:** the default model is Google's. Google's API terms restrict child-directed use, and this app's audience is children, so the provider choice may be decided by terms rather than quality. Which image providers explicitly permit child-directed apps?
8. **Appeal testing:** what's a sensible way to compare models on appeal with a child as the judge (side-by-side, blind, a few pages)?

## Review outcome (2026-09-26)

An external review endorsed the approach: drawing after approval, from the approved script, alongside the audio. **Decision: keep it as built for now.** Recommendations to pick up later, roughly in priority order:

1. **Smaller files:** 1024 px wide JPEG or WebP at quality 80–85, about 300 KB instead of 1.9 MB. Ask the API for `output_format` / `output_compression`, and keep server-side re-encoding as the fallback.
2. **Versioned image URLs:** include a revision or content hash in the path, because images are cached forever. Write the file before announcing it.
3. **Don't spoil the punchline:** "the funniest moment" can show the joke before it's spoken. Either tie the picture to a line and reveal it when that line starts, or draw an earlier, non-spoiling moment.
4. **An illustration brief from the script-writing call:** the chosen action, which characters are visible, essential props and their scale (the raisin must be comically too small), and the matching line. No extra model call. "Exactly as described" should apply only to characters in the scene.
5. **Display:** "contain" rather than crop, so a joke at the edge isn't cut off. Decide what a failed picture looks like without the layout jumping.
6. **Cost:** judge models on cost per usable picture, including redraws. Log model, provider, settings and outcome, and treat a missing cost as unknown, not zero. Candidates: Flash Lite Image (about half the price) and FLUX.2 Klein (from about $0.014).
7. **Consistency across 6 pages:** a written description plus page 1's picture as the fixed reference for every later page. Flash Lite is weaker at reference-guided drawing.
8. **Safety:** style wording isn't a safety mechanism. Before other children use the app: story and input checks, provider filtering, an output-image check, and positive age-specific limits for spooky stories. Send fictional character IDs rather than the child's names.
9. **Terms:** choose an *approved provider/model profile* (resolution, reference support, price limit, routing), not just any model. Google's Gemini Developer API terms rule out apps likely used by under-18s; OpenAI has an explicit framework for apps serving minors.
10. **Durability wording:** checkpointed tasks reduce duplicate charges but can't guarantee exactly-once billing. A crash between the provider charging and our save can still pay twice.

## Future direction: simple SVG art with light animation

An alternative look to explore: the text model writes simple SVG scenes (flat shapes, bold outlines) instead of an image model painting pictures.

- **For:**
  - It costs text tokens: a fraction of a penny, not about 7p.
  - It's resolution-independent and tiny to download.
  - It can be animated cheaply: blinking eyes, a bouncing character, props that wiggle when their line is spoken.
  - The style can be locked down for consistency across pages.
  - Animation could be synced to playback, e.g. the speaking character bobs.
  - It avoids image-model terms entirely, if the text provider permits the use.
- **Against:**
  - Model-written SVG of characters is often crude or oddly proportioned, so appeal needs testing.
  - Complex scenes are hard.
  - Validating and sanitising SVG is a must (scripts, external references).
- **A middle path:** a fixed library of hand-made or generated SVG character and prop parts that the model composes and poses. That gives consistency and animation without drawing from scratch each time.
