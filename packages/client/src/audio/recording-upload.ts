// Turns a finished recording's URI into an upload the StoryApi can send.
// Web: expo-audio gives a blob: URL (Chrome records webm/opus).
// Native: a file URI to an AAC .m4a.

import { Platform } from "react-native";
import type { AudioUpload } from "../api/story-api.ts";

export async function recordingUpload(uri: string): Promise<AudioUpload> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return { kind: "blob", blob, filename: "speech.webm" };
  }
  return { kind: "file", uri, name: "speech.m4a", type: "audio/m4a" };
}
