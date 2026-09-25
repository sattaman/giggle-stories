// Names a browser recording after what the browser actually recorded: Chrome
// and Firefox give WebM/Opus, Safari gives MP4/AAC (it has no WebM recorder).

export function recordingFilename(mimeType: string): string {
  const type = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "audio/mp4" || type === "audio/aac" || type === "audio/x-m4a") return "speech.m4a";
  if (type === "audio/ogg") return "speech.ogg";
  if (type === "audio/wav" || type === "audio/x-wav") return "speech.wav";
  return "speech.webm";
}
