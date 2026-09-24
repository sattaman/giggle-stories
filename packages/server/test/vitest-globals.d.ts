// Upstream typing defect: tinybench (via vitest) references the DOM-only
// `DOMHighResTimeStamp`, which @types/node does not declare. Tests only.
export {};

declare global {
  type DOMHighResTimeStamp = number;
}
