// The domain is platform-neutral (types: []), but zod's declarations reference the
// WHATWG `URL` global. Every runtime we target (Node, browsers, Hermes) provides it,
// so declare just that rather than pulling in Node or DOM typings.
export {};

declare global {
  interface URL {
    readonly href: string;
    toString(): string;
  }
  var URL: { prototype: URL; new (url: string, base?: string): URL };
}
