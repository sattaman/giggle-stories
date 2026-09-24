# ADR 0001: TypeScript toolchain and strictness

**Date:** 2026-09-24 · **Status:** accepted

## Context
The project is TypeScript end to end: server, web, and later an Expo mobile app. We follow the `typescript-setup` skill.

## Decision
- **Compilers:** TypeScript 7 (`tsc`) runs alongside TypeScript 6 (`tsc6`, installed as the `typescript` package) because typescript-eslint needs TypeScript 6. Both must pass in `pnpm check`.
- **Shared config:** `tsconfig.base.json` holds the strict+ baseline and targets ES2023 (Node 22). Each package extends it with its own overlay.
- **Linting:** assertion-hostile typed linting in `eslint.config.mjs`. Enforced: no `as`, no `!`, no `any`.
- **Runtime validation:** zod checks at every boundary (env, HTTP, LLM output, SDK results).
- **`skipLibCheck: false` stays on.**

## Exceptions
- **`@google/genai` 2.24.0 typing defect.** Its Node typings reference DOM-only types (`RequestInfo`, `HeadersInit`, `ErrorEvent`, `CloseEvent`). Each package that uses the SDK carries a small `google-genai-dom-shim.d.ts` with the minimal global declarations, rather than adding the DOM lib or skipping lib checks.
  Remove the shim when the SDK fixes its typings.
- **`langsmith` 0.10.5 typing defect.** Under `exactOptionalPropertyTypes`, `RunTree` doesn't match the `BaseRun` interface it implements (`events?: KVMap[]` vs `KVMap[] | undefined`).
  Fixed with a one-line `pnpm patch` (`patches/langsmith@0.10.5.patch`) that only changes the `.d.ts` file. Drop the patch when upgrading if upstream has fixed it; `pnpm install` fails loudly if the patch no longer applies.
- **`@langchain/core` 1.2.12 typing defect.** It has the same `exactOptionalPropertyTypes` mismatch (`AIMessageFields.usage_metadata`, `ZodV3TypeDef`/`ZodV3Like.description`).
  Fixed with a `.d.ts`-only `pnpm patch`. If this keeps growing with more LangChain packages, reconsider scoping `exactOptionalPropertyTypes` off for the LangChain-facing packages instead.
- **`packages/client` uses `skipLibCheck: true`** (the only package that does). Expo and React Native typings don't check:
  - react-native's `globals.d.ts` conflicts with lib.dom and @types/node;
  - expo-router's bundled react-navigation types fail under `exactOptionalPropertyTypes`;
  - reanimated and screens reference uninstalled modules.

  Our own client code is fully strict. The client test tsconfig keeps `skipLibCheck: false`. `noPropertyAccessFromIndexSignature` is off there because Expo only inlines `process.env.EXPO_PUBLIC_*` written with dot access.
- **Client tests** use Node's built-in `node:test` runner, which needs no extra dependency.
