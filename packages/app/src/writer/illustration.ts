// The picture for a page, described for an image model. Built from the page's own script (no
// extra model call), so the picture shows what the child is hearing.

import type { AgeBand, CharacterProfile, PageScript, StoryBrief } from "@storytime/domain";

/** One consistent look for every story: warm picture-book art, never text in the image. */
const STYLE = [
  "A warm, funny children's picture-book illustration in soft watercolour and ink.",
  "Bright, friendly colours, expressive cartoon characters with big readable faces, a clear focal point.",
  "Gentle and safe for young children; nothing frightening, gory or realistic-photo.",
  "Landscape composition with room around the characters.",
  "Absolutely no text, letters, words, numbers or speech bubbles in the image.",
].join(" ");

const MOOD: Record<AgeBand, string> = {
  "0-4": "Very simple shapes, a few big characters, soft rounded forms, cosy and bright.",
  "5-8": "Lively and playful, a little visual joke in the background.",
  "9-12": "More detailed scene with a sense of adventure, still cartoon-styled.",
};

export function illustrationPrompt(input: {
  readonly brief: StoryBrief;
  readonly cast: readonly CharacterProfile[];
  readonly script: PageScript;
  readonly ageBand: AgeBand;
  /** Earlier pages' pictures are attached: keep the characters and style identical to them. */
  readonly withReferences?: boolean;
}): string {
  const { brief, cast, script, ageBand } = input;
  return [
    STYLE,
    MOOD[ageBand],
    input.withReferences === true
      ? "This is a later page of the same picture book. The attached pictures are earlier pages: draw every character who appears in them with exactly the same face, body, colours and clothes, in the same art style."
      : "",
    `Story: ${brief.premise}`,
    brief.setting === "" ? "" : `Setting: ${brief.setting}.`,
    "Characters (draw each exactly as described, and the same way every time):",
    ...charactersAsDescribed(brief, cast),
    "Draw the single funniest or most exciting moment of this page, with the characters in it.",
    // Verbatim lines tempt image models to letter them in as a caption, so they're labelled as
    // context and the no-text rule comes last, where it carries most weight.
    "What happens on this page (for choosing the scene only; never write any of these words in the picture):",
    ...pageAsHeard(cast, script),
    "Remember: the picture must contain no text at all: no captions, letters, words, labels or speech bubbles.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Each character with the child's own words about them (species, colour, clothes) and personality. */
export function charactersAsDescribed(brief: StoryBrief, cast: readonly CharacterProfile[]): string[] {
  const detailsOf = new Map(brief.characters.map((c) => [c.name.toLowerCase(), c.details]));
  return cast.map((c) => {
    const details = detailsOf.get(c.name.toLowerCase());
    return `- ${c.name} ${c.emoji}: ${[details, c.personality].filter((part) => part !== undefined && part !== "").join("; ")}`;
  });
}

/** The page's lines as the child hears them, so a picture shows its moment rather than a summary. */
export function pageAsHeard(cast: readonly CharacterProfile[], script: PageScript): string[] {
  const nameOf = new Map(cast.map((c) => [c.id, c.name]));
  return script.segments.map((s) => `${s.speaker === "narrator" ? "Narrator" : (nameOf.get(s.speaker) ?? s.speaker)}: ${stripTags(s.text)}`);
}

/** Vocal tags like <giggle> are for the voice actor, not the illustrator. */
function stripTags(text: string): string {
  return text.replace(/<[a-z -]+>/gi, "").replace(/\s{2,}/g, " ").trim();
}
