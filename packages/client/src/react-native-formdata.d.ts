// Typing shim: React Native's FormData accepts a { uri, name, type } file
// descriptor (it streams the file from disk), but the DOM lib, which wins over
// RN's own global declarations here, only knows string | Blob. Only the native
// upload path (http-story-api.ts, kind "file") relies on this overload.
export {};

declare global {
  interface FormData {
    append(name: string, value: { readonly uri: string; readonly name: string; readonly type: string }): void;
  }
}
