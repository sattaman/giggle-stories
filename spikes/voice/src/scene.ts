import type { SpeakerKey } from "./cast.js";

// A hand-written ~80 second scene to test the core hypothesis: do expressive,
// distinct voices + a bit of comedy make a story feel alive?
// `text` is spoken verbatim (inline vocal tags only). `style` is the short acting note.

export interface Segment {
  readonly speaker: SpeakerKey;
  readonly text: string;
  readonly style: string;
}

export const scene: readonly Segment[] = [
  { speaker: "narrator", style: "warm, classic storybook opening", text: "This is a story about Pip Hartley, a perfectly sensible girl." },
  { speaker: "pip", style: "indignant, interrupting", text: "I am NOT sensible. I built a rocket out of a wheelie bin!" },
  { speaker: "narrator", style: "dry, correcting himself with a sigh", text: "<sigh> A MOSTLY sensible girl. <short pause> And her guinea pig, Reginald." },
  { speaker: "reginald", style: "pompous, deeply offended", text: "SIR Reginald. <tsk> I was knighted. By the cat." },
  { speaker: "pip", style: "deadpan", text: "The cat was asleep." },
  { speaker: "reginald", style: "wounded dignity", text: "She did not OBJECT." },
  { speaker: "narrator", style: "mock-serious, ominous", text: "One rainy Tuesday, Pip had an idea. <short pause> This was always a bad sign." },
  { speaker: "pip", style: "thrilled, bursting with excitement", text: "Reginald! We're going to the MOON! <giggle>" },
  { speaker: "reginald", style: "flat, immediate refusal", text: "Absolutely not. I get travel sick on the stairs." },
  { speaker: "narrator", style: "brisk list, building up", text: "Pip packed the essentials. Three jam sandwiches. <short pause> A torch. <short pause> And one extremely reluctant guinea pig." },
  { speaker: "reginald", style: "outraged, to anyone listening", text: "I would like it noted that I am being KIDNAPPED." },
  { speaker: "pip", style: "breezy, unbothered", text: "It's not kidnapping, it's an ADVENTURE. There's a difference." },
  { speaker: "reginald", style: "suspicious, narrowing his eyes", text: "Is the difference... snacks?" },
  { speaker: "pip", style: "caught out, small voice", text: "<short pause> ...Yes." },
  { speaker: "narrator", style: "building tension, then completely flat on the last line", text: "The wheelie bin rocket rumbled. It shook. It rattled. <long pause> It fell over." },
  { speaker: "pip", style: "shouting brightly", text: "<gasp> Nobody panic!" },
  { speaker: "reginald", style: "muffled, with enormous dignity", text: "I am upside down in a jam sandwich. I think panic is appropriate." },
  { speaker: "narrator", style: "hushed, suspenseful", text: "And that would have been the end of it. <short pause> Except... <long pause> the bin was still humming." },
  { speaker: "reginald", style: "very nervous, quiet", text: "Pip. <short pause> Why is the bin glowing?" },
  { speaker: "pip", style: "guilty but delighted", text: "<giggle> I MAY have added a few extra buttons." },
];
