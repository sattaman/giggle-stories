# Gemini TTS / Voice Design / Transcribe (JS, @google/genai 2.24.0) — verified 2026-09-24
- ai.interactions.create({model:"gemini-3.8-flash-tts", input:[{type:"user_input",content:[{type:"text",text, annotations:[{type:"speech_metadata",style}]}]}], response_format:{type:"audio"}, generation_config:{speech_config:[{voice}]}}) -> interaction.output_audio.data (base64 WAV 24kHz mono s16le). mime_type "audio/l16" for raw PCM.
- Voice design: ai.voices.create({store:true, voice:{model,type:"prompted",display_name,gender,language_code:"en-GB",prompted:{input:desc}}}) -> id voice_..., sample_audio.data preview. list/get/delete. 200/project, 1y TTL. Durable traits in description, not style.
- Tags: <laugh> <giggle> <gasp> <sigh> <short pause> <long pause> <snort> <groan> <cheer> <whispering> <yawn> <sneeze> ... text spoken verbatim; CAPS for emphasis; short style strings; avoid long director notes.
- Multi-speaker: max 2, prebuilt voices only. Custom voices -> per-turn synth (audio/l16) + concat + one WAV header.
- Streaming: stream:true, event_type "step.delta", delta.type "audio", base64 l16 chunks. Latency unverified.
- Price: Flash TTS $0.50 in / $9 out per 1M tok ≈ $0.0135/min; Lite ≈ $0.009/min; doubles 2027-01-01. Free tier lists Flash TTS.
- Transcribe: gemini-3.5-transcribe, generation_config.transcription_config {mode:"smart", language_codes:["en-GB"]}; webm/opus ok; inline data unverified (fallback ai.files.upload).
- UK: voice replication NOT available; voice design presumably OK (unverified). SynthID watermark. Vertex TTS "coming soon" -> use Developer API.

## Findings from live runs, 2026-09-24 (UK, AI Studio key)
- **Prebuilt voice TTS works.** Latency ≈ real time (6.9s of audio took 6.8s). Voice Design works from the UK and takes 13–33s per voice.
- **No child voices.** Voice Design rejects descriptions with age or child cues ("girl of about eleven", "youthful", "cheeky British kid") with *"Voice prompt was blocked by safety policies."* This isn't documented anywhere we could find.
  - Passed: descriptions of the sound ("light, bright, high-pitched British female voice…"), cartoon framing ("A cartoon heroine's voice for an animated adventure…"), and non-human characters (a pompous guinea pig).
  - The catalogue has 2,089 prebuilt voices, and **the youngest stated persona is 20**.
  - A `style` with a child cue ("like an excited eleven-year-old girl") was **not** blocked on a prebuilt voice. Don't depend on that; the policy could tighten.
- **Free tier: 3 requests per minute for gemini-3.8-flash-tts.** That makes a 20-line page unusable (about 7 minutes). Tier 1 (billing linked) is needed.
- **Prebuilt persona groups** include "Storyteller & Narrator" (205, with 13 en-GB) and "Character & Theatrical" (22, all adult). Candidates for narrator fallbacks: en-gb-storyteller-*.
- **Tier 1 run (2026-09-24, concurrency 4):** styled page: 112s of audio in 70s wall, median line 4.9s, ~$0.031. Plain page: 104s of audio in 116s wall, ~$0.029.
  - 429s still happen at concurrency 4 on Tier 1, so the TTS RPM limit is tight and needs checking at ai.dev/rate-limit.
  - Design implication: **start playback after line 1** and keep synthesis ahead of the listener, rather than waiting for the whole page.
- **Voice IDs belong to a single project.** After switching keys to another project, the cached voices had to be designed again.
