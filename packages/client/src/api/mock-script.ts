// Canned content for the in-memory mock API (EXPO_PUBLIC_MOCK=1).

import type { Character, Outline, Segment } from "@storytime/domain";

export const MOCK_TRANSCRIPTS: readonly string[] = [
  "A duck who is a pirate and is scared of cheese",
  "His name is Captain Crumbs and he has a frog friend",
  "Make the frog even sillier please",
];

export const MOCK_QUESTION = "Ooh, a pirate duck! What's the name of his best friend?";

export const MOCK_CHARACTERS: readonly Character[] = [
  {
    id: "captain-crumbs",
    name: "Captain Crumbs",
    role: "hero",
    emoji: "🦆",
    colour: "#FFB020",
    personality: "Brave about everything except dairy products.",
    comicTrait: "Faints whenever anyone says the word 'cheese'.",
    catchphrase: "Quack the sails!",
    gender: "male",
    voiceDescription: "A booming, gravelly pirate voice with a surprising little quack at the end of sentences.",
  },
  {
    id: "mrs-pickle",
    name: "Mrs Pickle",
    role: "sidekick",
    emoji: "🐸",
    colour: "#3DBE6A",
    personality: "Very sensible, very green, very tired of rescuing the captain.",
    comicTrait: "Speaks in rhymes when she gets nervous.",
    gender: "female",
    voiceDescription: "A crisp, posh, slightly croaky voice that speeds up into sing-song rhymes when flustered.",
  },
];

export const MOCK_OUTLINE: Outline = {
  storyTitle: "Captain Crumbs and the Cheesy Treasure",
  pages: [
    { page: 1, beat: "Captain Crumbs finds a treasure map in a bottle of pond water.", funnyMoment: "The map is written in crayon." },
    { page: 2, beat: "Mrs Pickle reads the map: the treasure is on Cheese Island!", funnyMoment: "The captain faints into a bucket." },
    { page: 3, beat: "They sail through a storm of flying biscuits.", funnyMoment: "Mrs Pickle rhymes the whole way through." },
    { page: 4, beat: "A grumpy seagull guards the treasure chest.", funnyMoment: "The seagull just wants a cuddle." },
    { page: 5, beat: "The chest is full of the smelliest cheese in the world.", funnyMoment: "Everyone faints, even the seagull." },
    { page: 6, beat: "They trade the cheese for a lifetime supply of bread.", funnyMoment: "Captain Crumbs finally earns his name." },
  ],
};

export const MOCK_SEGMENTS: readonly Segment[] = [
  { speaker: "narrator", text: "Once upon a Tuesday, on a very wobbly pirate ship, lived Captain Crumbs.", style: "warm" },
  { speaker: "captain-crumbs", text: "Quack the sails! Today we find TREASURE!", style: "booming" },
  { speaker: "mrs-pickle", text: "Captain, you said that yesterday. And the day before. We found a sock.", style: "deadpan" },
  { speaker: "narrator", text: "Just then, a bottle bobbed up beside the ship. Inside was a map, drawn in bright green crayon.", style: "mysterious" },
  { speaker: "captain-crumbs", text: "A treasure map! What does it say, Mrs Pickle?", style: "excited" },
  { speaker: "mrs-pickle", text: "It says... oh dear. The treasure is buried on... Cheese Island.", style: "nervous" },
  { speaker: "narrator", text: "There was a long, long silence. Then Captain Crumbs fell over backwards into a bucket.", style: "comic timing" },
  { speaker: "mrs-pickle", text: "Oh my, oh me, he's fainted, you see! Somebody fetch him a nice cup of tea!", style: "flustered rhyme" },
];
