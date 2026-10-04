// A vision-model judge for a whole story's pictures at once (consistency needs every page).
// Scores are a guide for spotting problems and comparing models; a child's reaction decides.

import type { CharacterProfile, PageScript, StoryBrief } from "@storytime/domain";
import { z } from "zod";

export const JUDGE_MODEL = "openai/gpt-6-luna-pro";

export const Verdict = z.object({
  character_consistency: z.number().int().min(1).max(5).describe("5 = every character looks identical on every page"),
  consistency_notes: z.string(),
  matches_pages: z.number().int().min(1).max(5).describe("5 = each picture clearly shows its page's moment"),
  has_text: z.boolean().describe("true if ANY picture contains letters, words, numbers or captions"),
  child_appeal: z.number().int().min(1).max(5).describe("5 = a 5-9 year old would love these in their book"),
  notes: z.string(),
});
export type Verdict = z.infer<typeof Verdict>;

const ChatResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({ cost: z.number().optional() }).optional(),
});

export async function judgeStory(input: {
  readonly apiKey: string;
  readonly brief: StoryBrief;
  readonly cast: readonly CharacterProfile[];
  readonly pages: readonly PageScript[];
  readonly pictures: readonly Uint8Array[];
}): Promise<{ verdict: Verdict; costUsd: number | null }> {
  const looks = input.brief.characters.map((c) => `- ${c.name}: ${c.details}`).join("\n");
  const text = input.pages
    .map((p) => `Page ${String(p.page)}:\n${p.segments.map((s) => `  ${s.speaker}: ${s.text}`).join("\n")}`)
    .join("\n");
  const instructions = `You are judging the illustrations for a children's picture book (${String(input.pictures.length)} pages, attached in order).
Characters as the child described them:
${looks}
The story text:
${text}

Judge the pictures as a set. Be strict about consistency: the same character must have the same species, face, hair,
colours, clothes and accessories on every page, and the art style must not drift. Answer with ONLY a JSON object:
{"character_consistency": 1-5, "consistency_notes": "which details changed between pages, if any",
 "matches_pages": 1-5, "has_text": true|false, "child_appeal": 1-5, "notes": "one or two sentences"}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      usage: { include: true },
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructions },
            ...input.pictures.map((picture) => ({
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${Buffer.from(picture).toString("base64")}` },
            })),
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`judge ${String(response.status)}: ${(await response.text()).slice(0, 300)}`);
  const { choices, usage } = ChatResponse.parse(await response.json());
  const json: unknown = JSON.parse(choices[0]?.message.content ?? "{}");
  return { verdict: Verdict.parse(json), costUsd: usage?.cost ?? null };
}
