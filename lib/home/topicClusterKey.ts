/**
 * Deterministic topic/event keys for home diversity (no OpenAI).
 *
 * - normalizeTopicClusterKey: SAME EVENT spelling + optional ANGLE suffix
 * - normalizeEventFamilyKey: coarser family for featured+spotlight caps
 *   (e.g. nepal flood / Korean Nepal evacuation → nepal-flood)
 *
 * Never merges different countries on a single shared word like "flood".
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
  "rescue",
  "evacuat",
  "이송",
  "구조",
  "고립",
  "실종",
  "missing",
  "cause",
  "빙하",
  "glacier",
  "climate",
  "온난화",
]);

export type TopicSignalInput = {
  topic_key?: string | null;
  topic_label?: string | null;
  title?: string | null;
};

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

function extractAngleSuffix(tokens: string[]): string {
  const kept = tokens.filter((t) =>
    [...ANGLE_TOKENS].some((a) => t.includes(a) || a.includes(t))
  );
  return kept.slice(0, 3).join("-");
}

function topicFieldTokens(input: TopicSignalInput): string[] {
  const rawKey = input.topic_key?.trim().toLowerCase() ?? "";
  const rawLabel = input.topic_label?.trim().toLowerCase() ?? "";
  const base = (rawKey || rawLabel).replace(/^topic:/, "");
  return base ? tokenize(base) : [];
}

function titleTokens(input: TopicSignalInput): string[] {
  const title = input.title?.trim() ?? "";
  return title ? tokenize(title) : [];
}

/**
 * Known multi-signal event stems only (never single-word collapse).
 * Topic fields preferred; title used only to detect these same stems
 * when topic_key is missing (e.g. Nepal evacuation headlines).
 */
export function detectEventFamilyStem(tokens: string[]): string | null {
  const hasNepal = tokens.some((t) => /nepal|네팔/.test(t));
  if (
    hasNepal &&
    tokens.some((t) =>
      /flood|홍수|급류|glacier|빙하|실종|고립|이송|evacuat|missing|rescue/.test(t)
    )
  ) {
    return "nepal-flood";
  }
  if (
    tokens.some((t) => /지지율|approval/.test(t)) &&
    tokens.some((t) => /이재명|lee/.test(t))
  ) {
    return "lee-approval";
  }
  if (
    tokens.some((t) => t.includes("공매도") || t.includes("shortsell")) ||
    (tokens.some((t) => t.includes("short")) &&
      tokens.some((t) => t.includes("sell")))
  ) {
    return "shortselling";
  }
  if (
    tokens.some((t) => /hospital/.test(t)) &&
    tokens.some((t) => /fire|화재/.test(t))
  ) {
    return "hospitalfire";
  }
  return null;
}

function tokensForFamily(input: TopicSignalInput): string[] {
  const topic = topicFieldTokens(input);
  if (topic.length > 0) {
    // Merge title tokens only to help stem known families (evacuation titles).
    return [...topic, ...titleTokens(input)];
  }
  return titleTokens(input);
}

/**
 * Coarse event family for featured + 「지금 주목」 caps.
 */
export function normalizeEventFamilyKey(
  input: TopicSignalInput
): string | null {
  const tokens = tokensForFamily(input);
  if (tokens.length === 0) return null;
  const stem = detectEventFamilyStem(tokens);
  return stem;
}

/**
 * Returns a stable cluster id (family + optional angle), or null.
 * Title is used only when topic fields are empty AND a known event family
 * stem matches — never invents clusters from arbitrary headlines.
 */
export function normalizeTopicClusterKey(
  input: TopicSignalInput
): string | null {
  const topicTokens = topicFieldTokens(input);

  if (topicTokens.length === 0) {
    const fromTitle = titleTokens(input);
    if (fromTitle.length === 0) return null;
    const stem = detectEventFamilyStem(fromTitle);
    if (!stem) return null;
    const angle = extractAngleSuffix(fromTitle);
    return (angle ? `${stem}-${angle}` : stem).slice(0, 80);
  }

  const angle = extractAngleSuffix(topicTokens);
  const stem = detectEventFamilyStem([
    ...topicTokens,
    ...titleTokens(input),
  ]);

  if (stem) {
    const withAngle = angle ? `${stem}-${angle}` : stem;
    return withAngle.slice(0, 80);
  }

  let s = topicTokens
    .join("-")
    .replace(/네팔-?중국|nepal-?china|nepal-?tibet/g, "nepal")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (s.length < 3) return null;
  return s.slice(0, 80);
}

export function extractEventAngleKey(input: TopicSignalInput): string | null {
  const topicTokens = topicFieldTokens(input);
  const tokens =
    topicTokens.length > 0 ? topicTokens : titleTokens(input);
  if (tokens.length === 0) return null;
  // Title-only angles only when a known family stem matches.
  if (topicTokens.length === 0 && !detectEventFamilyStem(tokens)) {
    return null;
  }
  const angle = extractAngleSuffix(tokens);
  return angle || null;
}

/**
 * True when candidate is a meaningful UPDATE / DIFFERENT ANGLE versus
 * already-selected articles in the same event family.
 */
export function isDistinctEventAngle(
  candidate: TopicSignalInput,
  existing: TopicSignalInput[]
): boolean {
  const family = normalizeEventFamilyKey(candidate);
  if (!family) return true;

  const candCluster = normalizeTopicClusterKey(candidate);

  for (const ex of existing) {
    if (normalizeEventFamilyKey(ex) !== family) continue;
    const exCluster = normalizeTopicClusterKey(ex);
    // Different cluster string on the same family = UPDATE / DIFFERENT ANGLE.
    if (candCluster && exCluster && candCluster !== exCluster) return true;
    // Same family + same (or missing) cluster → not distinct.
    return false;
  }
  return true;
}

/** True when two topic signals collapse to the same home cluster (SAME EVENT). */
export function isSameTopicCluster(
  a: TopicSignalInput,
  b: TopicSignalInput
): boolean {
  const ka = normalizeTopicClusterKey(a);
  const kb = normalizeTopicClusterKey(b);
  return Boolean(ka && kb && ka === kb);
}

/** Max articles for one event family across featured + spotlight. */
export const HOME_CORE_EVENT_FAMILY_MAX = 2;
