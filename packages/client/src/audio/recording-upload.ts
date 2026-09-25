// Turns a finished recording's URI into an upload the StoryApi can send.
// Web: expo-audio gives a blob: URL (Chrome records webm/opus, Safari mp4/aac).
// Native: a file URI to an AAC .m4a.

import { Platform } from "react-native";
import type { AudioUpload } from "../api/story-api.ts";
import { recordingFilename } from "./audio-format.ts";

export async function recordingUpload(uri: string): Promise<AudioUpload> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return { kind: "blob", blob, filename: recordingFilename(blob.type) };
  }
  return { kind: "file", uri, name: "speech.m4a", type: "audio/m4a" };
}
