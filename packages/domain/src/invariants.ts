// Rules the story must obey regardless of which model wrote it.

import { NARRATOR, type CharacterProfile, type CharacterSketch, type PageScript } from "./story.ts";

const VOCAL_TAG = /<[a-z -]+>/g;
const STAGE_DIRECTION = /\[[^\]]*\]|\*[^*]+\*|\((?:whisper|laugh|sigh|gasp|shout)[^)]*\)/i;

/** Voice Design rejects descriptions that suggest a child's voice (observed 2026-09-24). */
const CHILD_VOICE_CUES =
  /\b(child|children|kid|kids|girl|boy|toddler|baby|young|youthful|teen|teenage|little|tiny|small|sweet|squeaky|sing-?song|\d+[- ]?(year|yr)s?[- ]?old|age[ds]?)\b/i;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Words in a voice description that Voice Design is likely to block. */
export function childVoiceCues(description: string): string[] {
  return [...description.matchAll(new RegExp(CHILD_VOICE_CUES, "gi"))].map((m) => m[0]);
}

/**
 * Removes wording Voice Design is likely to block, keeping the rest of the description.
 * Cheap first line of defence before an LLM rewrite.
 */
export function sanitizeVoiceDescription(description: string): string {
  return description
    // Keep the gender when removing child wording: "a cheeky boy's voice" → "a cheeky male voice".
    .replace(/\b(boy|son|lad)(?:'s|s)?\b/gi, "male")
    .replace(/\b(girl|daughter|lass)(?:'s|s)?\b/gi, "female")
    .replace(new RegExp(CHILD_VOICE_CUES, "gi"), "")
    .replace(/\b(a|an)\s+(?=[,.;]|and\b|with\b|$)/gi, "")
    .replace(/\s*,\s*(,\s*)+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/^[\s,;]+|[\s,;]+$/g, "")
    .trim();
}

/**
 * A forgiving key for names heard through speech-to-text: "Skye"/"sky", "Orla"/"Orlaa",
 * "Lily"/"Lilly"/"Lillie" all match.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "")
    .replace(/(ie|ey|ee)$/, "y")
    .replace(/(.)e$/, "$1")
    .replace(/(.)\1+/g, "$1");
}

/** Keeps the first of any characters whose names match by nameKey. */
export function dedupeByName<T extends { readonly name: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = nameKey(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every character the child named must survive into the cast, unrenamed. */
export function missingCharacters(
  sketches: readonly CharacterSketch[],
  cast: readonly CharacterProfile[],
): string[] {
  const castNames = new Set(cast.map((c) => nameKey(c.name)));
  return sketches.map((s) => s.name).filter((name) => !castNames.has(nameKey(name)));
}

export function scriptProblems(script: PageScript, cast: readonly CharacterProfile[]): string[] {
  const known = new Set<string>([NARRATOR, ...cast.map((c) => c.id)]);
  const problems: string[] = [];
  script.segments.forEach((segment, i) => {
    const line = `line ${String(i + 1)}`;
    if (!known.has(segment.speaker)) problems.push(`${line}: unknown speaker "${segment.speaker}"`);
    if (STAGE_DIRECTION.test(segment.text)) problems.push(`${line}: stage direction in spoken text`);
    if (segment.text.replace(VOCAL_TAG, "").trim().length === 0) problems.push(`${line}: no spoken words`);
  });
  if (!script.segments.some((s) => s.speaker !== NARRATOR)) problems.push("no character dialogue");
  return problems;
}
