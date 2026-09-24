# Gemini TTS / Voice Design / Transcribe (JS, @google/genai 2.24.0) — verified 2026-09-24
- ai.interactions.create({model:"gemini-3.8-flash-tts", input:[{type:"user_input",content:[{type:"text",text, annotations:[{type:"speech_metadata",style}]}]}], response_format:{type:"audio"}, generation_config:{speech_config:[{voice}]}}) -> interaction.output_audio.data (base64 WAV 24kHz mono s16le). mime_type "audio/l16" for raw PCM.
- Voice design: ai.voices.create({store:true, voice:{model,type:"prompted",display_name,gender,language_code:"en-GB",prompted:{input:desc}}}) -> id voice_..., sample_audio.data preview. list/get/delete. 200/project, 1y TTL. Durable traits in description, not style.
- Tags: <laugh> <giggle> <gasp> <sigh> <short pause> <long pause> <snort> <groan> <cheer> <whispering> <yawn> <sneeze> ... text spoken verbatim; CAPS for emphasis; short style strings; avoid long director notes.
- Multi-speaker: max 2, prebuilt voices only. Custom voices -> per-turn synth (audio/l16) + concat + one WAV header.
- Streaming: stream:true, event_type "step.delta", delta.type "audio", base64 l16 chunks. Latency unverified.
- Price: Flash TTS $0.50 in / $9 out per 1M tok ≈ $0.0135/min; Lite ≈ $0.009/min; doubles 2027-01-01. Free tier lists Flash TTS.
- Transcribe: gemini-3.5-transcribe, generation_config.transcription_config {mode:"smart", language_codes:["en-GB"]}; webm/opus ok; inline data unverified (fallback ai.files.upload).
- UK: voice replication NOT available; voice design presumably OK (unverified). SynthID watermark. Vertex TTS "coming soon" -> use Developer API.
