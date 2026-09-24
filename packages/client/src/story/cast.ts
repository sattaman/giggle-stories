// Who can appear on a character card: the story's characters plus the narrator.

import { NARRATOR, type Character } from "@storytime/domain";

export interface CastMember {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly colour: string;
  readonly trait: string | null;
  readonly sampleUrl: string | null;
}

export const NARRATOR_MEMBER: CastMember = {
  id: NARRATOR,
  name: "Narrator",
  emoji: "📖",
  colour: "#7B5CFF",
  trait: "Tells the story",
  sampleUrl: null,
};

export function castMember(character: Character): CastMember {
  return {
    id: character.id,
    name: character.name,
    emoji: character.emoji,
    colour: character.colour,
    trait: character.comicTrait === "" ? null : character.comicTrait,
    sampleUrl: character.voice?.sampleUrl ?? null,
  };
}

export function castOf(characters: readonly Character[], withNarrator: boolean): CastMember[] {
  const members = characters.map(castMember);
  return withNarrator ? [NARRATOR_MEMBER, ...members] : members;
}

/** The card for a speaker id; unknown speakers fall back to the narrator's look. */
export function memberFor(cast: readonly CastMember[], speaker: string): CastMember {
  return cast.find((m) => m.id === speaker) ?? { ...NARRATOR_MEMBER, id: speaker, name: speaker };
}
