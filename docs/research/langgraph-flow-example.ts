import { StateGraph, StateSchema, START, END, Command, interrupt, MemorySaver, type GraphNode, isInterrupted, INTERRUPT } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { fakeModel } from "langchain";
import { z } from "zod";

const Outline = z.object({ pages: z.array(z.string()).length(6) });
type Outline = z.infer<typeof Outline>;
interface StoryLLM { outline(idea: string, feedback?: string): Promise<Outline> }

const State = new StateSchema({
  idea: z.string(),
  outline: Outline.optional(),
  feedback: z.string().optional(),
  approved: z.boolean().default(false),
});
const Deps = z.object({ llm: z.custom<StoryLLM>() });

const makeOutline: GraphNode<typeof State, z.infer<typeof Deps>> = async (s, config) => {
  config.writer?.({ stage: "outline", msg: "drafting" });
  return { outline: await config.context!.llm.outline(s.idea, s.feedback) };
};
const review: GraphNode<typeof State> = (s) => {
  const d = interrupt<{ type: string; outline?: Outline }, { approved: boolean; feedback?: string }>({ type: "outline_review", outline: s.outline });
  return d.approved ? new Command({ update: { approved: true }, goto: END })
                    : new Command({ update: { feedback: d.feedback }, goto: "makeOutline" });
};

const builder = new StateGraph(State, Deps)
  .addNode("makeOutline", makeOutline)
  .addNode("review", review, { ends: ["makeOutline", END] })
  .addEdge(START, "makeOutline").addEdge("makeOutline", "review");

// adapter using fake model + withStructuredOutput
const model = fakeModel().structuredResponse({ pages: ["1","2","3","4","5","6"] }).structuredResponse({ pages: ["a","b","c","d","e","f"] });
const llm: StoryLLM = { outline: async () => model.withStructuredOutput(Outline).invoke("x") as Promise<Outline> };

const graph = builder.compile({ checkpointer: SqliteSaver.fromConnString(":memory:") });
const cfg = { configurable: { thread_id: "t1" }, context: { llm } };
const r1 = await graph.invoke({ idea: "a dragon" }, cfg);
if (isInterrupted(r1)) console.log("r1 interrupt:", JSON.stringify(r1[INTERRUPT]));
console.log("isInterrupted:", isInterrupted(r1));
const snap = await graph.getState(cfg);
console.log("next:", snap.next, "tasks interrupts:", snap.tasks.map(t => t.interrupts.length));
for await (const [mode, chunk] of await graph.stream(new Command({ resume: { approved: false, feedback: "more cats" } }), { ...cfg, streamMode: ["updates", "custom"] })) {
  console.log(mode, JSON.stringify(chunk));
}
const r3 = await graph.invoke(new Command({ resume: { approved: true } }), cfg);
console.log("final:", r3.approved, r3.outline?.pages.join(""));
console.log("node direct:", await graph.nodes["makeOutline"].invoke({ idea: "x" } as any, { context: { llm: { outline: async () => ({ pages: ["z","z","z","z","z","z"] }) } } } as any));
const cfg2 = { configurable: { thread_id: "t2" }, context: { llm }, version: "v3" as const };
const s = await graph.streamEvents({ idea: "owl" }, cfg2);
for await (const v of s.values) {}
console.log("v3 interrupted:", s.interrupted, JSON.stringify(s.interrupts));
const s2 = await graph.streamEvents(new Command({ resume: { approved: true } }), cfg2);
console.log("v3 output:", JSON.stringify(await s2.output));
