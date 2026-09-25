import { describe, expect, it } from "vitest";
import { childVoiceCues, missingCharacters, sanitizeVoiceDescription, scriptProblems, slugify } from "../src/invariants.ts";
import type { CharacterProfile, PageScript } from "../src/story.ts";

const pip: CharacterProfile = {
  id: "pip",
  name: "Pip",
  role: "hero",
  emoji: "🚀",
  colour: "#ff8800",
  personality: "fearless inventor",
  comicTrait: "builds rockets out of bins",
  gender: "female",
  voiceDescription: "A very high, soft, adorable animated-character voice, bouncy and excitable.",
  hello: "Hi! I'm Pip!",
};

describe("slugify", () => {
  it("makes URL-safe ids from names", () => {
    expect(slugify("Sir Reginald Crumb!")).toBe("sir-reginald-crumb");
    expect(slugify("  Zoë  ")).toBe("zoe");
  });
});

describe("childVoiceCues", () => {
  it("flags wording that Voice Design blocks", () => {
    expect(childVoiceCues("a cheeky British kid, about 11-year-old")).toEqual(["kid", "11-year-old"]);
    expect(childVoiceCues("tiny, sweet, squeaky cartoon voice")).toEqual(["tiny", "sweet", "squeaky"]);
  });
  it("passes descriptions of sound only", () => {
    expect(childVoiceCues(pip.voiceDescription)).toEqual([]);
  });
});

describe("sanitizeVoiceDescription", () => {
  it("strips child cues but keeps the sound of the voice", () => {
    const cleaned = sanitizeVoiceDescription("A bright, cheeky young boy's voice, tiny and squeaky, with a Scottish accent.");
    expect(childVoiceCues(cleaned)).toEqual([]);
    expect(cleaned).toContain("bright");
    expect(cleaned).toContain("Scottish accent");
  });
});

describe("missingCharacters", () => {
  it("reports characters the child named that are absent or renamed", () => {
    const sketches = [
      { name: "Pip", role: "hero" as const, gender: "female" as const, details: "" },
      { name: "Mr Wobbles", role: "creature" as const, gender: "unknown" as const, details: "" },
    ];
    expect(missingCharacters(sketches, [pip])).toEqual(["Mr Wobbles"]);
  });
});

describe("scriptProblems", () => {
  const script = (segments: PageScript["segments"]): PageScript => ({ page: 1, segments });

  it("accepts a clean script", () => {
    expect(
      scriptProblems(
        script([
          { speaker: "narrator", text: "Once upon a time.", style: "warm" },
          { speaker: "pip", text: "Hello! <giggle>", style: "excited" },
        ]),
        [pip],
      ),
    ).toEqual([]);
  });

  it("rejects unknown speakers, stage directions and narration-only pages", () => {
    const problems = scriptProblems(
      script([
        { speaker: "narrator", text: "[sound of rain] It was dark.", style: "" },
        { speaker: "bob", text: "Hi", style: "" },
      ]),
      [pip],
    );
    expect(problems).toContain('line 2: unknown speaker "bob"');
    expect(problems).toContain("line 1: stage direction in spoken text");
    expect(scriptProblems(script([{ speaker: "narrator", text: "Only me.", style: "" }]), [pip])).toContain(
      "no character dialogue",
    );
  });
});

describe("ReplyBody", () => {
  it("accepts answers, approvals and change requests", async () => {
    const { ReplyBody } = await import("../src/api.ts");
    expect(ReplyBody.parse({ kind: "answer", text: "grumpy" })).toEqual({ kind: "answer", text: "grumpy" });
    expect(ReplyBody.parse({ kind: "outline", approved: true })).toEqual({ kind: "outline", approved: true });
    expect(ReplyBody.safeParse({ kind: "outline", approved: false }).success).toBe(false);
  });
});
