// The story writer: each creative step as a typed call to the StructuredModel port,
// with domain invariants checked and one corrective retry where they're violated.

import {
  Cast,
  ClarificationDecision,
  Outline,
  PageScript,
  StoryBrief,
  dedupeByName,
  missingCharacters,
  nameKey,
  scriptProblems,
  slugify,
  DEFAULT_AGE_BAND,
  type AgeBand,
  type CharacterProfile,
} from "@storytime/domain";
import { z } from "zod";
import type { StructuredModel } from "../ports.ts";
import {
  CAST,
  DECIDE,
  EXTRACT_BRIEF,
  OUTLINE,
  REVISE_OUTLINE,
  RECAST,
  REWRITE_VOICE,
  WRITE_PAGE,
  storyteller,
  block,
} from "./prompts.ts";

export interface QuestionAndAnswer {
  readonly question: string;
  readonly answer: string;
}

const VoiceRewrite = z.object({ voiceDescription: z.string().min(20).max(600) });

export class StoryWriter {
  private readonly storyteller: string;

  constructor(
    private readonly model: StructuredModel,
    ageBand: AgeBand = DEFAULT_AGE_BAND,
  ) {
    this.storyteller = storyteller(ageBand);
  }

  async extractBrief(idea: string, answers: readonly QuestionAndAnswer[]): Promise<StoryBrief> {
    const brief = await this.model.generate({
      task: "extract_brief",
      schema: StoryBrief,
      system: `${this.storyteller}\n\n${EXTRACT_BRIEF}`,
      prompt: [block("child_idea", idea), block("answers", answers)].join("\n\n"),
      creative: false,
    });
    // Safety net for speech-to-text spelling variants ("Skye" / "sky").
    return { ...brief, characters: dedupeByName(brief.characters) };
  }

  decide(brief: StoryBrief, answers: readonly QuestionAndAnswer[]): Promise<ClarificationDecision> {
    return this.model.generate({
      task: "decide_clarification",
      schema: ClarificationDecision,
      system: `${this.storyteller}\n\n${DECIDE}`,
      prompt: [block("brief", brief), block("already_asked", answers)].join("\n\n"),
      creative: false,
    });
  }

  async cast(brief: StoryBrief): Promise<CharacterProfile[]> {
    const request = (feedback: string | undefined) =>
      this.model.generate({
        task: "cast_characters",
        schema: Cast,
        system: `${this.storyteller}\n\n${CAST}`,
        prompt: [block("brief", brief), ...(feedback === undefined ? [] : [block("fix_this", feedback)])].join("\n\n"),
        creative: true,
      });

    let characters = dedupeByName((await request(undefined)).characters);
    const missing = missingCharacters(brief.characters, characters);
    if (missing.length > 0) {
      characters = dedupeByName(
        (await request(`You left out or renamed: ${missing.join(", ")}. Include them with exact names.`)).characters,
      );
    }
    // Ids must be unique and match names, whatever the model did.
    const seen = new Set<string>();
    return characters.map((character) => {
      let id = slugify(character.name) || "character";
      while (seen.has(id)) id = `${id}-2`;
      seen.add(id);
      return { ...character, id };
    });
  }

  /** Applies the child's change request to an existing cast (ids kept stable). */
  async recast(brief: StoryBrief, cast: readonly CharacterProfile[], feedback: string): Promise<CharacterProfile[]> {
    const { characters } = await this.model.generate({
      task: "recast_characters",
      schema: Cast,
      system: `${this.storyteller}\n\n${CAST}\n\n${RECAST}`,
      prompt: [block("brief", brief), block("current_cast", cast), block("child_changes", feedback)].join("\n\n"),
      creative: false,
    });
    const byName = new Map(cast.map((c) => [nameKey(c.name), c.id]));
    const seen = new Set<string>();
    return dedupeByName(characters).map((character) => {
      let id = byName.get(nameKey(character.name)) ?? (slugify(character.name) || "character");
      while (seen.has(id)) id = `${id}-2`;
      seen.add(id);
      return { ...character, id };
    });
  }

  outline(brief: StoryBrief, cast: readonly CharacterProfile[]): Promise<Outline> {
    return this.model.generate({
      task: "outline",
      schema: Outline,
      system: `${this.storyteller}\n\n${OUTLINE}`,
      prompt: [block("brief", brief), block("cast", summariseCast(cast))].join("\n\n"),
      creative: true,
    });
  }

  reviseOutline(brief: StoryBrief, cast: readonly CharacterProfile[], outline: Outline, feedback: string): Promise<Outline> {
    return this.model.generate({
      task: "revise_outline",
      schema: Outline,
      system: `${this.storyteller}\n\n${OUTLINE}\n\n${REVISE_OUTLINE}`,
      prompt: [
        block("brief", brief),
        block("cast", summariseCast(cast)),
        block("current_outline", outline),
        block("child_feedback", feedback),
      ].join("\n\n"),
      creative: true,
    });
  }

  async writePage(brief: StoryBrief, cast: readonly CharacterProfile[], outline: Outline, page: number): Promise<PageScript> {
    const request = (problems: readonly string[]) =>
      this.model.generate({
        task: "write_page",
        schema: PageScript,
        system: `${this.storyteller}\n\n${WRITE_PAGE}`,
        prompt: [
          block("brief", brief),
          block("cast", summariseCast(cast)),
          block("outline", outline),
          block("write_page", String(page)),
          ...(problems.length === 0 ? [] : [block("fix_these_problems", problems.join("\n"))]),
        ].join("\n\n"),
        creative: true,
      });

    const first = await request([]);
    const problems = scriptProblems(first, cast);
    if (problems.length === 0) return { ...first, page };
    const second = await request(problems);
    // Drop any lines that are still invalid rather than fail the child's story.
    const known = new Set(["narrator", ...cast.map((c) => c.id)]);
    return { page, segments: second.segments.filter((s) => known.has(s.speaker)) };
  }

  async rewriteVoiceDescription(character: CharacterProfile): Promise<string> {
    const { voiceDescription } = await this.model.generate({
      task: "rewrite_voice",
      schema: VoiceRewrite,
      system: REWRITE_VOICE,
      prompt: block("character", {
        name: character.name,
        gender: character.gender,
        personality: character.personality,
        comicTrait: character.comicTrait,
        rejected: character.voiceDescription,
      }),
      creative: false,
    });
    return voiceDescription;
  }
}

function summariseCast(cast: readonly CharacterProfile[]): unknown {
  return cast.map(({ id, name, role, personality, comicTrait, catchphrase }) => ({
    id,
    name,
    role,
    personality,
    comicTrait,
    catchphrase,
  }));
}
