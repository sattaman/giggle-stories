# ADR 0001: TypeScript toolchain and strictness

**Date:** 2026-09-24 · **Status:** accepted

## Context
The project is TypeScript end to end: server, web, and later an Expo mobile app. We follow the `typescript-setup` skill.

## Decision
- **Compilers:** TypeScript 7 (`tsc`) runs alongside TypeScript 6 (`tsc6`, installed as the `typescript` package) because typescript-eslint needs TypeScript 6. Both must pass in `pnpm check`.
- **Shared config:** `tsconfig.base.json` holds the strict+ baseline and targets ES2023 (Node 22). Each package extends it with its own overlay.
- **Linting:** assertion-hostile typed linting in `eslint.config.mjs`. Enforced: no `as`, no `!`, no `any`.
- **Runtime validation:** zod checks at every boundary (env, HTTP, LLM output, SDK results).
- **`skipLibCheck: true`** (revised 2026-09-26). Everything we write, tests included, is checked
  in full under the strict+ flags. Third-party `.d.ts` files are not: several dependencies'
  typings fail under `exactOptionalPropertyTypes`, or reference DOM types from Node code
  (`@langchain/core`, `langsmith`, `@google/genai`, vitest, zod). Checking them meant carrying
  two `pnpm patch` files and nine shim files. That fixed nothing at runtime and added
  maintenance with every upgrade. `skipLibCheck: true` is the TypeScript team's recommended
  setting for applications. Our zod validation at runtime boundaries is unaffected.

## Exceptions
- **`packages/client`** extends Expo's base config, so it repeats `skipLibCheck: true`. `noPropertyAccessFromIndexSignature` is off there because Expo only inlines `process.env.EXPO_PUBLIC_*` written with dot access.
- **Client tests** use Node's built-in `node:test` runner, which needs no extra dependency.
