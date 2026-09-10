/** Keyword / text matching for editorial collection rules. */

export function normalizeEditorialText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Korean/CJK: substring (particles/endings).
 * Latin: word boundary + basic plural (s/es).
 * Multi-word phrases supported for both.
 */
export function keywordMatches(text: string, keyword: string): boolean {
  const normalized = normalizeEditorialText(keyword);
  if (!normalized) return false;

  if (/[^\x00-\x7f]/u.test(normalized)) {
    return text.includes(normalized);
  }

  const escaped = escapeRegExp(normalized).replace(/\\ /g, "\\s+");
  return new RegExp(
    `(?:^|[^a-z0-9])${escaped}(?:s|es)?(?:$|[^a-z0-9])`,
    "iu"
  ).test(text);
}

export function parseKeywordList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = normalizeEditorialText(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, 80));
    if (out.length >= 80) break;
  }
  return out;
}
