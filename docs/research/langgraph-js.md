# LangGraph.js — checked 2026-09-24 against the listed versions
Versions: @langchain/langgraph 1.4.17, @langchain/core 1.2.12, langchain 1.5.12, @langchain/openrouter 0.4.13,
@langchain/langgraph-checkpoint-sqlite 1.0.4 / -postgres 1.0.5, @langchain/langgraph-cli 1.5.0, zod 4.6.5.
Working example (passes tsc --strict, runs on Node 22): ./langgraph-flow-example.ts

- **API choice:** use the Graph API, not the Functional API. We have branches and loops, and Studio can visualise it.
- **State:** `new StateSchema({...zod})` is the main way now; `Annotation.Root` is legacy. zod v4 is supported.
  Helpers: ReducedValue, UntrackedValue, MessagesValue. Separate input/output schemas: `new StateGraph({state,input,output})`.
  **The default recursionLimit is 25**, so raise it for the revise loop.
- **Interrupts:** `interrupt<Req, Res>(payload)` pauses a node; the node returns `new Command({update, goto})` and is added with `addNode(n, fn, {ends:[...]})`.
  - Detect a pause with `isInterrupted(r)` / `r[INTERRUPT]`. `r.__interrupt__` exists at runtime but isn't in the types.
  - Resume with `graph.invoke(new Command({resume}), cfg)`. `getState(cfg).tasks[0].interrupts` shows what's pending.
  - Rules: the node re-runs from the top on resume, so keep side effects in earlier nodes. Never put interrupt inside try/catch. Keep interrupt order deterministic.
- **Dependency injection:** `new StateGraph(State, ContextZod)`. Pass `{ configurable:{thread_id}, context:{llm,tts} }` on every call; a node reads `config.context`.
  `z.custom<Port>()` works for class instances. There is no getRuntime in JS.
- **Retries:** `addNode(n, fn, {retryPolicy:{retryOn}})`. Models retry up to 6 times by default.
- **Checkpointers:**
  - `MemorySaver` (in @langchain/langgraph) for tests.
  - `SqliteSaver.fromConnString("story.db")` for local (uses better-sqlite3, a native module).
  - `PostgresSaver.fromConnString(url)` then `.setup()` for Cloud Run.
  - `durability: "exit"|"async"|"sync"`, default async.
- **Structured output:** `new ChatOpenRouter({model, temperature, maxRetries})`, then `.withStructuredOutput(Zod, {name, method:"jsonSchema", strict:true})`.
  `initChatModel` is async; "openrouter" is a valid provider.
- **Streaming:** `graph.stream(input, {...cfg, streamMode:["updates","custom"]})` yields [mode, chunk]. Emit custom events with `config.writer?.({...})`.
  A pause arrives as a `{__interrupt__:[...]}` chunk in updates mode. The v3 `streamEvents` exists, but custom events there need transformers.
- **Testing (vitest):**
  - Build the graph with a fresh MemorySaver in each test. Test one node with `graph.nodes["x"].invoke(state,{context})`.
  - `updateState(cfg, values, asNode)` jumps to a point in the flow.
  - `fakeModel()` from "langchain" supports structured output, **but queued structuredResponse calls don't queue** (the last one repeats). Prefer faking the ports.
- **Studio:** `npx @langchain/langgraph-cli dev` with LANGSMITH_API_KEY. Open https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024.
  - langgraph.json: `{ "node_version":"22", "graphs":{"story":"./src/graph.ts:graph"}, "env":".env" }`.
  - Export the graph **without** a checkpointer. It needs default port wiring for dev.
- **ESM:** packages ship both ESM and CJS. Compiles with NodeNext.
- **Deprecated:** checkpointDuring; createReactAgent (replaced by createAgent).
