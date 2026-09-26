import { Command, MemorySaver, isInterrupted } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { compileStoryGraph } from "../src/graph/story-graph.ts";
import { illustrationPrompt } from "../src/writer/illustration.ts";
import { extractSvg, svgProblems } from "../src/writer/scene.ts";
import { FakeIllustrator, FakeModel, FakeSceneDrawer, SCENE_SVG, brief, cast, decisions, deps, outline, script } from "../testing/fakes.ts";

function setup(illustrator: FakeIllustrator) {
  const model = new FakeModel({
    extract_brief: [brief],
    decide_clarification: [decisions.ready],
    cast_characters: [cast],
    outline: [outline("First plan")],
    revise_outline: [outline("Revised plan")],
    recast_characters: [cast],
    write_page: [script],
  });
  const graph = compileStoryGraph(new MemorySaver());
  const config = { configurable: { thread_id: "pic" }, context: { deps: deps({ model, illustrator }) } };
  return { graph, config };
}

describe("the page's picture", () => {
  it("is drawn once, after approval, from the page the child hears", async () => {
    const illustrator = new FakeIllustrator();
    const { graph, config } = setup(illustrator);
    const review = await graph.invoke({ storyId: "pic", idea: "Pip" }, config);
    if (!isInterrupted(review)) throw new Error("expected outline review");
    await graph.invoke(new Command({ resume: { approved: false, feedback: "Make it spookier" } }), config);
    expect(illustrator.prompts).toHaveLength(0); // nothing drawn for plans that change

    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(done.illustrationUrl).toBe("/images/pic/page-1-picture.png");
    expect(done.performance).toHaveLength(script.segments.length);
    expect(illustrator.prompts).toHaveLength(1);
    expect(illustrator.prompts[0]).toContain("Pip: To the MOON!");
  });

  it("leaves the story without a picture when drawing fails", async () => {
    const { graph, config } = setup(new FakeIllustrator(true));
    await graph.invoke({ storyId: "pic", idea: "Pip" }, config);
    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(done.illustrationUrl).toBeNull();
    expect(done.performance.every((s) => s.audioUrl !== null)).toBe(true);
  });
});

describe("illustrationPrompt", () => {
  const prompt = illustrationPrompt({ brief, cast: cast.characters, script, ageBand: "0-4" });

  it("describes characters in the child's words and the page as heard, without vocal tags", () => {
    expect(prompt).toContain("Pip 🚀: inventor, loves jam");
    expect(prompt).toContain("Narrator: It was a bad plan.");
    expect(prompt).toContain("Pip: A brilliant bad plan.");
    expect(prompt).not.toContain("<giggle>");
  });

  it("forbids text in the image, last of all, and sets the mood for the age band", () => {
    expect(prompt).toContain("no text, letters, words");
    expect(prompt).toContain("never write any of these words in the picture");
    expect(prompt.split("\n").at(-1)).toMatch(/^Remember: the picture must contain no text/);
    expect(prompt).toContain("Very simple shapes");
  });
});

describe("the page's animated scene", () => {
  function run(options: { pictures: ("painted" | "animated")[]; drawer?: FakeSceneDrawer }) {
    const model = new FakeModel({ extract_brief: [brief], decide_clarification: [decisions.ready], cast_characters: [cast], outline: [outline("Plan")], write_page: [script] });
    const drawer = options.drawer ?? new FakeSceneDrawer();
    const graph = compileStoryGraph(new MemorySaver());
    const config = { configurable: { thread_id: "svg" }, context: { deps: deps({ model, sceneDrawer: drawer, pictures: options.pictures }) } };
    return { graph, config, drawer };
  }

  it("draws both pictures after approval when both are asked for", async () => {
    const { graph, config, drawer } = run({ pictures: ["painted", "animated"] });
    await graph.invoke({ storyId: "svg", idea: "Pip" }, config);
    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(done).toMatchObject({ pictureKinds: ["painted", "animated"], illustrationUrl: "/images/svg/page-1-picture.png", sceneUrl: "/images/svg/page-1-scene.svg" });
    expect(drawer.prompts[0]).toContain("Pip: To the MOON!");
  });

  it("only draws the kinds asked for", async () => {
    const { graph, config, drawer } = run({ pictures: ["painted"] });
    await graph.invoke({ storyId: "svg", idea: "Pip" }, config);
    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(done).toMatchObject({ pictureKinds: ["painted"], sceneUrl: null });
    expect(drawer.prompts).toHaveLength(0);
  });

  it("refuses an unsafe SVG and carries on without it", async () => {
    const drawer = new FakeSceneDrawer('<svg viewBox="0 0 8 6"><script>alert(1)</script></svg>');
    const { graph, config } = run({ pictures: ["animated"], drawer });
    await graph.invoke({ storyId: "svg", idea: "Pip" }, config);
    const done = await graph.invoke(new Command({ resume: { approved: true } }), config);
    expect(done.sceneUrl).toBeNull();
    expect(done.performance.every((s) => s.audioUrl !== null)).toBe(true);
  });
});

describe("svgProblems / extractSvg", () => {
  it("passes a plain animated SVG with internal references", () => {
    expect(svgProblems(SCENE_SVG)).toEqual([]);
    expect(svgProblems('<svg viewBox="0 0 8 6"><defs><symbol id="a"/></defs><use href="#a"/></svg>')).toEqual([]);
  });

  it("flags scripts, handlers, embedded HTML and external references", () => {
    const bad = (inner: string) => svgProblems(`<svg viewBox="0 0 8 6">${inner}</svg>`);
    expect(bad("<script>x()</script>")).toContain("script element");
    expect(bad('<rect onclick="x()"/>')).toContain("event handler");
    expect(bad("<foreignObject><div/></foreignObject>")).toContain("embedded HTML");
    expect(bad('<image href="https://evil.example/x.png"/>')).toContain("external link or image");
    expect(bad('<style>rect{fill:url("https://evil.example/f")}</style>')).toContain("external url()");
    expect(svgProblems("<div>not svg</div>")).toContain("not a single <svg> element");
  });

  it("extracts the svg code block from a model answer", () => {
    expect(extractSvg("<plan>x</plan>\n```svg\n<svg viewBox=\"0 0 8 6\"></svg>\n```")).toBe('<svg viewBox="0 0 8 6"></svg>');
    expect(extractSvg("no svg here")).toBeUndefined();
  });
});
