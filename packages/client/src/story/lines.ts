/** Script lines can carry vocal tags such as <giggle> or <short pause>; children shouldn't see them. */
export function displayText(scriptText: string): string {
  return scriptText
    .replace(/<[^<>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
