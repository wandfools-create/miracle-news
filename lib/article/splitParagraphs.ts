/** Split article body into display paragraphs (blank-line separated). */
export function splitArticleParagraphs(body: string | null): string[] {
  return (body || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
