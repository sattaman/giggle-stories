// Who is in the scene and what they sound like.
// Voice Design guidance: put *durable* traits (age, timbre, accent, energy) in the
// description, keep it to 1–2 sentences, and leave per-line delivery to `style`.

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
      "A bright, young-sounding British girl of about eleven, quick-talking and endlessly confident, with a cheeky, playful energy and a laugh always close to the surface.",
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
