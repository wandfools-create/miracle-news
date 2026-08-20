/** Cheap, non-AI title overlap for same-event RSS duplicates. */

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "on",
  "to",
  "for",
  "and",
  "or",
  "with",
  "as",
  "at",
  "by",
  "from",
  "after",
  "over",
  "under",
  "into",
  "about",
  "new",
  "says",
  "said",
  "say",
  "report",
  "reports",
  "latest",
  "update",
  "updates",
  "breaking",
  "watch",
  "here",
  "how",
  "why",
  "what",
  "who",
  "his",
  "her",
  "its",
  "their",
  "this",
  "that",
  "will",
  "has",
  "have",
  "been",
  "are",
  "was",
  "were",
]);

export function significantTitleTokens(title: string): string[] {
  const tokens = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9가-힣]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));

  return [...new Set(tokens)];
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) {
    if (b.has(t)) shared += 1;
  }
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Returns a previously seen title if this looks like the same story. */
export function findVerySimilarTitle(
  title: string,
  existingTitles: Iterable<string>
): string | null {
  const tokens = significantTitleTokens(title);
  if (tokens.length < 4) return null;

  const incoming = new Set(tokens);

  for (const existing of existingTitles) {
    const otherTokens = significantTitleTokens(existing);
    if (otherTokens.length < 4) continue;

    const other = new Set(otherTokens);
    let shared = 0;
    for (const t of incoming) {
      if (other.has(t)) shared += 1;
    }

    const score = jaccard(incoming, other);
    const subset =
      shared === Math.min(incoming.size, other.size) && shared >= 5;

    if (score >= 0.72 || (shared >= 5 && score >= 0.55) || subset) {
      return existing;
    }
  }

  return null;
}
