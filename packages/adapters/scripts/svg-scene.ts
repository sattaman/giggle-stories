// Experiment: an animated SVG scene for a story page, written by the text model.
//   node_modules/.bin/tsx scripts/svg-scene.ts [model] [effort]
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { z } from "zod";

Object.assign(process.env, parseEnv(readFileSync("/Users/thomas.sanderson/Personal/storytime/.env", "utf8")));
const model = process.argv[2] ?? "openai/gpt-6-luna-pro";
const effort = process.argv[3] ?? "high";

const page = `Characters:
- Biscuit: a fluffy golden hamster who wears a tiny white chef hat; proud, dramatic, secretly nervous.
Setting: a tiny kitchen made from a shoebox; the oven is a warm patch of sunshine.
Page 1 (as the child hears it):
Narrator: His kitchen was a shoebox. His oven was a warm patch of sunshine.
Narrator: He reached for a spoon to stir. Then he saw it: long, shiny, and reflecting his own worried face.
Biscuit: A spoon! The rival chef has arrived!
Narrator: Biscuit leapt behind the nearest hiding place. It was a single raisin.
Biscuit: Stay close, brave raisin. I may need your raisinous protection.`;

const system = `You are an illustrator and animator for a children's audio-story app (ages 5-8). You draw one charming,
funny scene per page as hand-written SVG with CSS animation. Be honest with yourself about what you can draw well by hand:
prefer simple, bold, rounded shapes with thick outlines and flat friendly colours over detail you can't pull off.`;

const prompt = `${page}

1. In <plan>, briefly decide: which single moment to show (it must match the text; the joke is that the raisin is
   comically too small to hide Biscuit), how you'll draw each element so it reads clearly and looks appealing, and which
   2-5 small, looping animations you can reliably achieve and that add charm (e.g. blinking, trembling, a glint on the
   spoon, a bobbing chef hat, sunbeam shimmer). Keep it achievable.
2. Then output ONE self-contained SVG in a \`\`\`svg code block:
   - viewBox="0 0 800 600", no width/height attributes.
   - Animations with CSS @keyframes inside a <style> element (no SMIL, no JavaScript); loops, gentle, respects
     @media (prefers-reduced-motion: reduce) by turning animations off.
   - No text, letters or numbers. No <script>, no event handlers, no external references or images.
   - Give major groups ids (e.g. id="biscuit", id="raisin", id="spoon") so the app could animate them later.`;

const Response = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    completion_tokens_details: z.object({ reasoning_tokens: z.number().optional() }).optional(),
    cost: z.number().optional(),
  }),
});

const started = Date.now();
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { authorization: `Bearer ${process.env["OPENROUTER_API_KEY"] ?? ""}`, "content-type": "application/json" },
  body: JSON.stringify({ model, reasoning: { effort }, usage: { include: true }, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
});
if (!res.ok) throw new Error(`${String(res.status)} ${(await res.text()).slice(0, 400)}`);
const body = Response.parse(await res.json());
const content = body.choices[0]?.content ?? body.choices[0]?.message.content ?? "";
const plan = /<plan>([\s\S]*?)<\/plan>/.exec(content)?.[1]?.trim() ?? "(no plan)";
const svg = /```svg\s*([\s\S]*?)```/.exec(content)?.[1]?.trim() ?? "";

const unsafe = [/<script/i, /\son[a-z]+\s*=/i, /(href|src)\s*=\s*["'](?!#)/i, /<foreignObject/i, /@import/i, /url\(\s*["']?(?!#)/i].filter((r) => r.test(svg)).map(String);
const tag = `${model.replace(/\W+/g, "-")}-${effort}`;
writeFileSync(`/tmp/sg/svg/${tag}.svg`, svg);
writeFileSync(`/tmp/sg/svg/${tag}.plan.txt`, plan);
console.log(JSON.stringify({
  model, effort, seconds: Math.round((Date.now() - started) / 1000),
  promptTokens: body.usage.prompt_tokens, completionTokens: body.usage.completion_tokens,
  reasoningTokens: body.usage.completion_tokens_details?.reasoning_tokens ?? null, costUsd: body.usage.cost ?? null,
  svgBytes: svg.length, keyframes: (svg.match(/@keyframes/g) ?? []).length, ids: [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]).slice(0, 20),
  unsafe,
}, null, 1));
console.log("\nPLAN:\n" + plan);
