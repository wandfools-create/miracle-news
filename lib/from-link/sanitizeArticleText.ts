/** Remove URLs and markdown links so AI cannot persist wrong article links in body. */
export function stripUrlsFromArticleText(text: string): string {
  let t = text.trim();
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1");
  t = t.replace(/https?:\/\/[^\s<>"')\]]+/gi, "");
  t = t.replace(/\bwww\.[^\s<>"')\]]+/gi, "");
  return t.replace(/\n{3,}/g, "\n\n").replace(/  +/g, " ").trim();
}

export function countSubstantiveParagraphs(text: string): number {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 50).length;
}
