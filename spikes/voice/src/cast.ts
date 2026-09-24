// Who is in the scene and what they sound like.
// Voice Design guidance: put *durable* traits (timbre, pitch, accent, energy) in the
// description, keep it to 1–2 sentences, and leave per-line delivery to `style`.
//
// Child voices: Voice Design rejects descriptions with age/child cues ("girl of about
// eleven", "youthful", "kid" → "blocked by safety policies"), and the 2,089-voice
// catalogue has no persona under 20. Describe how the voice *sounds* or frame it as a
// cartoon character instead (see docs/research/gemini-tts.md, 2026-09-24 probe).

export interface CastMember {
  readonly key: string;
  readonly displayName: string;
  readonly gender: "male" | "female";
  readonly description: string;
}

export const cast = [
  {
    key: "narrator",
    displayName: "storytime-spike-narrator",
    gender: "male",
    description:
      "A warm, rich-voiced middle-aged British storyteller with a dry wit and impeccable comic timing, who always sounds very slightly exasperated with his own characters.",
  },
  {
    key: "pip",
    displayName: "storytime-spike-pip",
    gender: "female",
    description:
      "A cartoon heroine's voice for an animated adventure: bright, bouncy, cheeky and fearless, with a British accent.",
  },
  {
    key: "reginald",
    displayName: "storytime-spike-reginald",
    gender: "male",
    description:
      "A tiny guinea pig with an absurdly grand, pompous, old-fashioned English aristocrat's voice: booming, theatrical and easily offended, a little squeaky at the edges.",
  },
] as const satisfies readonly CastMember[];

export type SpeakerKey = (typeof cast)[number]["key"];
