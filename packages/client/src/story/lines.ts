/** Script lines can carry vocal tags such as <giggle> or <short pause>; children shouldn't see them. */
export function displayText(scriptText: string): string {
  return scriptText
    .replace(/<[^<>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Roughly how long a child needs to read a line on screen. */
export function readingTimeMs(text: string): number {
  const words = text.split(/\s+/).filter((w) => w !== "").length;
  return 1500 + words * 400;
}
