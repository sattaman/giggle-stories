// The animated SVG scene for a page: the text model draws it by hand with simple shapes and
// CSS animation. It decides for itself which animations it can pull off well.

import type { AgeBand, CharacterProfile, PageScript, StoryBrief } from "@storytime/domain";
import { charactersAsDescribed, pageAsHeard } from "./illustration.ts";

const AUDIENCE: Record<AgeBand, string> = {
  "0-4": "toddlers (0-4): very few, very big, very simple shapes",
  "5-8": "children aged 5-8",
  "9-12": "children aged 9-12: a bit more detail and wit, still cartoon-styled",
};

export function scenePrompt(input: {
  readonly brief: StoryBrief;
  readonly cast: readonly CharacterProfile[];
  readonly script: PageScript;
  readonly ageBand: AgeBand;
}): string {
  const { brief, cast, script, ageBand } = input;
  return [
    `You are an illustrator and animator for a children's audio-story app, drawing for ${AUDIENCE[ageBand]}.`,
    "You draw one charming, funny scene per page as hand-written SVG with CSS animation. Be honest with yourself about",
    "what you can draw well by hand: simple, bold, rounded shapes with thick outlines and flat friendly colours beat",
    "detail you can't pull off. Make each character unmistakably what it is (a hamster must read as a hamster).",
    "",
    `Story: ${brief.premise}`,
    brief.setting === "" ? "" : `Setting: ${brief.setting}.`,
    "Characters:",
    ...charactersAsDescribed(brief, cast),
    "This page, as the child hears it:",
    ...pageAsHeard(cast, script),
    "",
    "1. In <plan>, briefly decide: the single moment to show (it must match the text; keep the page's joke visible, e.g.",
    "   sizes that make it funny), how to draw each element so it reads clearly and looks appealing, and which 2-5 small,",
    "   looping animations you can reliably achieve that add charm (blinking, trembling, a glint, a bob, a shimmer).",
    "2. Then output ONE self-contained SVG in a ```svg code block:",
    '   - viewBox="0 0 800 600", no width/height attributes.',
    "   - Animations with CSS @keyframes inside one <style> element (no SMIL, no JavaScript); gentle loops, turned off",
    "     under @media (prefers-reduced-motion: reduce).",
    "   - No text, letters or numbers. No <script>, event handlers, links, images or external references.",
    '   - Give each character and key prop a group id matching its name in lowercase (e.g. id="biscuit").',
  ]
    .filter((line, i, lines) => !(line === "" && lines[i - 1] === ""))
    .join("\n");
}

/** Pulls the SVG out of the model's answer. */
export function extractSvg(answer: string): string | undefined {
  const svg = /```svg\s*([\s\S]*?)```/.exec(answer)?.[1]?.trim();
  return svg?.startsWith("<svg") === true ? svg : undefined;
}

/**
 * Problems that make an SVG unsafe to show. Model-written SVG is untrusted: no scripts, event
 * handlers, embedded HTML or external references. An empty list means it passed.
 */
export function svgProblems(svg: string): string[] {
  const checks: [RegExp, string][] = [
    [/<script/i, "script element"],
    [/\son[a-z]+\s*=/i, "event handler"],
    [/<foreignObject/i, "embedded HTML"],
    [/(?:href|src)\s*=\s*["'](?!#)/i, "external link or image"],
    [/url\(\s*["']?(?!#)/i, "external url()"],
    [/@import/i, "stylesheet import"],
    [/<!DOCTYPE|<!ENTITY/i, "DTD or entity"],
  ];
  const problems = checks.filter(([pattern]) => pattern.test(svg)).map(([, problem]) => problem);
  if (!/^<svg[\s>]/.test(svg) || !svg.trimEnd().endsWith("</svg>")) problems.push("not a single <svg> element");
  if (svg.length > 200_000) problems.push("too large");
  return problems;
}
