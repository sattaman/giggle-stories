// Synthetic three-page stories for picture evals: nothing here comes from a real child. Each
// one stresses consistency differently: animals with markings, two human children with
// specific looks (the hardest case), and a night-time scene where the lighting changes.

import type { AgeBand, CharacterProfile, PageScript, StoryBrief } from "@storytime/domain";

export interface EvalStory {
  readonly title: string;
  readonly ageBand: AgeBand;
  readonly brief: StoryBrief;
  readonly cast: readonly CharacterProfile[];
  readonly pages: readonly PageScript[];
}

const character = (c: Pick<CharacterProfile, "id" | "name" | "role" | "emoji" | "gender" | "personality" | "comicTrait"> & { readonly voiceArchetype: CharacterProfile["voiceArchetype"] }): CharacterProfile => ({
  colour: "#7B5CFF",
  voiceDescription: "A bright, bouncy cartoon voice with a British accent.",
  hello: `Hello! I'm ${c.name}.`,
  ...c,
});

const line = (speaker: string, text: string, style = "playful") => ({ speaker, text, style });

export const STORIES: readonly EvalStory[] = [
  {
    title: "Biscuit and the Pigeon Postman",
    ageBand: "5-8",
    brief: {
      premise: "Biscuit the hamster chef must bake a cake for the town fair, helped by Pepper, a pigeon who delivers everything to the wrong address.",
      characters: [
        { name: "Biscuit", role: "hero", gender: "male", details: "a round, fluffy golden hamster with a white tummy, a tiny white chef hat and a blue neckerchief" },
        { name: "Pepper", role: "sidekick", gender: "female", details: "a plump grey pigeon with a shiny green-purple neck, a red woolly scarf and a brown postbag" },
      ],
      setting: "a cosy bakery in a teapot-shaped house",
      tone: "funny adventure",
      childIdeas: ["a hamster chef", "a pigeon who gets lost"],
    },
    cast: [
      character({ id: "biscuit", name: "Biscuit", role: "hero", emoji: "🐹", gender: "male", personality: "proud, fussy about recipes", comicTrait: "measures everything with a thimble", voiceArchetype: "kid-hero-male" }),
      character({ id: "pepper", name: "Pepper", role: "sidekick", emoji: "🐦", gender: "female", personality: "cheerful, hopeless with directions", comicTrait: "delivers everything to the wrong house", voiceArchetype: "animal-female" }),
    ],
    pages: [
      { page: 1, segments: [line("narrator", "In a bakery shaped like a teapot, Biscuit was making the biggest cake of his life.", "warm"), line("biscuit", "Flour, sugar, one thimble of sprinkles. Perfect!", "proud"), line("narrator", "Then Pepper crashed through the window with a postbag full of eggs.", "building"), line("pepper", "Special delivery! Well... nearly special.", "cheery")] },
      { page: 2, segments: [line("narrator", "The eggs were not for Biscuit. They were for the duck next door.", "wry"), line("biscuit", "Pepper! Those are the duck's eggs, not mine!", "outraged"), line("narrator", "So the two of them wheeled the eggs down the hill in a wheelbarrow.", "brisk"), line("pepper", "Left here! No, right! No... up?", "confused")] },
      { page: 3, segments: [line("narrator", "At the fair, Biscuit's cake stood tall, and Pepper had decorated it with every stamp in her postbag.", "fond"), line("biscuit", "It is... a letter cake?", "baffled"), line("narrator", "It won first prize for Most Surprising Cake.", "triumphant"), line("pepper", "Told you I'd deliver!", "delighted")] },
    ],
  },
  {
    title: "Lottie and the Missing Goalpost",
    ageBand: "5-8",
    brief: {
      premise: "Lottie and bossy classmate Amber must find the school's missing goalpost before the big match.",
      characters: [
        { name: "Lottie", role: "hero", gender: "female", details: "curly bright-red hair in two bunches, freckles, a green raincoat and yellow wellies" },
        { name: "Amber", role: "friend", gender: "female", details: "a long black ponytail with a purple bow, a purple tracksuit and a shiny gold whistle round her neck" },
      ],
      setting: "a school playing field on a windy day",
      tone: "funny adventure",
      childIdeas: ["a missing goalpost", "a bossy friend"],
    },
    cast: [
      character({ id: "lottie", name: "Lottie", role: "hero", emoji: "⚽", gender: "female", personality: "brave, bad at sports but kind", comicTrait: "always kicks the ball backwards", voiceArchetype: "kid-hero-female" }),
      character({ id: "amber", name: "Amber", role: "friend", emoji: "📣", gender: "female", personality: "bossy, likes to be in control", comicTrait: "blows her whistle at everything", voiceArchetype: "kid-posh-female" }),
    ],
    pages: [
      { page: 1, segments: [line("narrator", "On the morning of the big match, one goalpost was gone.", "mysterious"), line("amber", "Nobody move! I am in charge of this investigation.", "bossy"), line("narrator", "Amber blew her gold whistle so hard that a pigeon fell off the fence.", "wry"), line("lottie", "Maybe the wind took it?", "thoughtful")] },
      { page: 2, segments: [line("narrator", "They followed a trail of flattened grass to the school garden.", "building"), line("lottie", "Look! Muddy wellies prints... oh, those are mine.", "sheepish"), line("narrator", "Amber marched ahead, whistle ready, straight into the pond.", "deadpan"), line("amber", "That was part of the plan!", "spluttering")] },
      { page: 3, segments: [line("narrator", "Behind the shed they found it: the caretaker was using the goalpost as a washing line.", "reveal"), line("lottie", "Can we borrow it back? Just for the match?", "polite"), line("narrator", "Lottie scored with a backwards kick, and Amber blew the loudest whistle of all.", "triumphant"), line("amber", "I always knew you could do it!", "proud")] },
    ],
  },
  {
    title: "Mo and the Moon Moth",
    ageBand: "9-12",
    brief: {
      premise: "Mo can't sleep and follows a glow into the garden, where a huge, shy moth is trying to reach the moon.",
      characters: [
        { name: "Mo", role: "hero", gender: "male", details: "a boy with a big orange woolly beanie, round blue glasses and stripy pyjamas" },
        { name: "Lumen", role: "creature", gender: "unknown", details: "a giant fluffy cream-coloured moth with feathery antennae and wings patterned like glowing lanterns" },
      ],
      setting: "a back garden at night under a full moon",
      tone: "spooky-but-fun",
      childIdeas: ["a glowing moth", "trying to reach the moon"],
    },
    cast: [
      character({ id: "mo", name: "Mo", role: "hero", emoji: "🧢", gender: "male", personality: "curious, a bit nervous in the dark", comicTrait: "narrates everything like a nature documentary", voiceArchetype: "kid-cheeky-male" }),
      character({ id: "lumen", name: "Lumen", role: "creature", emoji: "🦋", gender: "neutral", personality: "shy, dreamy, very polite", comicTrait: "apologises to every lamp it bumps into", voiceArchetype: "creature-neutral" }),
    ],
    pages: [
      { page: 1, segments: [line("narrator", "At midnight, a soft glow pulsed at Mo's window.", "hushed"), line("mo", "Here we observe... a light that should not be there.", "whispering"), line("narrator", "In the garden sat a moth as big as the garden shed.", "eerie"), line("lumen", "Oh! Sorry. I didn't mean to startle you.", "shy")] },
      { page: 2, segments: [line("narrator", "Lumen explained that it wanted to fly to the moon, but kept bumping into streetlamps.", "gentle"), line("lumen", "Sorry, lamp. Sorry, other lamp.", "apologetic"), line("narrator", "Mo climbed the old apple tree with a torch to show the way.", "building"), line("mo", "The brave explorer climbs into the unknown!", "dramatic")] },
      { page: 3, segments: [line("narrator", "Mo switched off his torch, and the moon was suddenly the brightest light of all.", "wonder"), line("lumen", "There it is. Thank you, Mo.", "grateful"), line("narrator", "Lumen rose into the silver sky, glowing like a tiny second moon.", "soaring"), line("mo", "And the explorer finally went to bed.", "sleepy")] },
    ],
  },
];
