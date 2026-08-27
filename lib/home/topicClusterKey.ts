/**
 * Deterministic topic/event cluster key for home diversity (no OpenAI).
 *
 * Goals:
 * - Collapse clear SAME EVENT spelling variants (e.g. Nepal flood headlines)
 * - Preserve UPDATE / DIFFERENT ANGLE signals when distinctive tokens remain
 * - Avoid merging unrelated countries/events on a single shared word
 */
const FILLER = new Set(["the", "a", "an", "and", "of", "in", "on", "to", "for"]);

/** Tokens that mark UPDATE / DIFFERENT ANGLE — keep them after event stemming. */
const ANGLE_TOKENS = new Set([
  "death",
  "toll",
  "사망",
  "update",
  "갱신",
  "response",
  "대응",
  "government",
  "정부",
  "arrest",
  "체포",
  "probe",
  "investigation",
  "수사",
  "특검",
  "angle",
  "피해규모",
]);

function tokenize(raw: string): string[] {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((tok) => !FILLER.has(tok));
}

function hasAll(tokens: string[], needles: string[]): boolean {
  return needles.every((n) => tokens.some((t) => t.includes(n) || n.includes(t)));
}

function extractAngleSuffix(tokens: string[]): string {
  const kept = tokens.filter((t) =>
    [...ANGLE_TOKENS].some((a) => t.includes(a) || a.includes(t))
  );
  return kept.slice(0, 3).join("-");
}

/**
 * Returns a stable cluster id, or null when there is no topic signal.
 */
export function normalizeTopicClusterKey(input: {
  topic_key?: string | null;
  topic_label?: string | null;
  title?: string | null;
}): string | null {
  const rawKey = input.topic_key?.trim().toLowerCase() ?? "";
  const rawLabel = input.topic_label?.trim().toLowerCase() ?? "";
  // Prefer structured topic fields only — never fall back to freeform title
  // (title-only matching over-merges unrelated stories).
  const base = (rawKey || rawLabel).replace(/^topic:/, "");
  if (!base) return null;

  const tokens = tokenize(base);
  if (tokens.length === 0) return null;

  const angle = extractAngleSuffix(tokens);

  // Clear multi-token SAME EVENT stems only (require co-occurring signals).
  let stem: string | null = null;
  if (
    hasAll(tokens, ["nepal"]) &&
    tokens.some((t) => /flood|홍수|급류|glacier|빙하/.test(t))
  ) {
    stem = "nepal-flood";
  } else if (
    tokens.some((t) => /지지율|approval/.test(t)) &&
    tokens.some((t) => /이재명|lee/.test(t))
  ) {
    stem = "lee-approval";
  } else if (
    tokens.some((t) => t.includes("공매도") || t.includes("shortsell")) ||
    (tokens.some((t) => t.includes("short")) &&
      tokens.some((t) => t.includes("sell")))
  ) {
    stem = "shortselling";
  } else if (
    tokens.some((t) => /hospital/.test(t)) &&
    tokens.some((t) => /fire|화재/.test(t))
  ) {
    stem = "hospitalfire";
  }

  if (stem) {
    const withAngle = angle ? `${stem}-${angle}` : stem;
    return withAngle.slice(0, 80);
  }

  // Default: light spelling normalize without single-word event collapse.
  let s = tokens
    .join("-")
    .replace(/네팔-?중국|nepal-?china|nepal-?tibet/g, "nepal")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (s.length < 3) return null;
  return s.slice(0, 80);
}

/** True when two topic signals collapse to the same home cluster (SAME EVENT). */
export function isSameTopicCluster(
  a: { topic_key?: string | null; topic_label?: string | null },
  b: { topic_key?: string | null; topic_label?: string | null }
): boolean {
  const ka = normalizeTopicClusterKey(a);
  const kb = normalizeTopicClusterKey(b);
  return Boolean(ka && kb && ka === kb);
}
