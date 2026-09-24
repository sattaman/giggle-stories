// Upstream typing defect: @google/genai 2.24.0 `dist/node/node.d.ts` references
// DOM-only lib types (RequestInfo, HeadersInit, ErrorEvent, CloseEvent) that
// @types/node 22 does not declare. We keep `skipLibCheck: false` (typescript-setup
// skill) and declare the minimal shapes here instead of pulling the whole DOM lib
// into Node code. Remove once the SDK's Node typings are self-contained.
export {};

declare global {
  type RequestInfo = Request | string;
  type HeadersInit = [string, string][] | Record<string, string> | Headers;
  interface ErrorEvent extends Event {
    readonly message: string;
    readonly error: unknown;
  }
  interface CloseEvent extends Event {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
  }
}
