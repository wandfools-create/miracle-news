/**
 * Title similarity for RSS same-run / lookback dedupe.
 * Korean tokens use min length 2; English keeps min length 4.
 */

import { significantStoryTokens } from "@/lib/same-event/tokens";

/** @deprecated Prefer significantStoryTokens — kept for callers. */
export function significantTitleTokens(title: string): string[] {
  return significantStoryTokens(title);
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

/**
 * Returns a previously seen title if this looks like the same story.
 * Korean: requires ≥2 significant tokens (names like 오세훈 count).
 * English: still requires ≥4 tokens (unchanged strictness).
 */
export function findVerySimilarTitle(
  title: string,
  existingTitles: Iterable<string>
): string | null {
  const tokens = significantStoryTokens(title);
  const hangulHeavy = /[가-힣]/.test(title);
  const minTokens = hangulHeavy ? 2 : 4;
  if (tokens.length < minTokens) return null;

  const incoming = new Set(tokens);

  for (const existing of existingTitles) {
    const otherTokens = significantStoryTokens(existing);
    const otherHangul = /[가-힣]/.test(existing);
    const otherMin = otherHangul ? 2 : 4;
    if (otherTokens.length < otherMin) continue;

    const other = new Set(otherTokens);
    let shared = 0;
    for (const t of incoming) {
      if (other.has(t)) shared += 1;
    }

    const score = jaccard(incoming, other);
    const subset =
      shared === Math.min(incoming.size, other.size) &&
      shared >= (hangulHeavy || otherHangul ? 2 : 5);

    const krHit =
      (hangulHeavy || otherHangul) &&
      (shared >= 2 && score >= 0.4 || shared >= 3 && score >= 0.28);
    const enHit =
      score >= 0.72 || (shared >= 5 && score >= 0.55) || subset;

    if (krHit || enHit) {
      return existing;
    }
  }

  return null;
}
