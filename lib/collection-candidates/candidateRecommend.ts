/** Pure helpers for AI candidate recommend grades (no OpenAI). */

export const AI_RECOMMEND_GRADES = [
  "best",
  "priority",
  "normal",
  "low",
] as const;

export type AiRecommendGrade = (typeof AI_RECOMMEND_GRADES)[number];

export const AI_RECOMMEND_GRADE_LABELS: Record<AiRecommendGrade, string> = {
  best: "BEST",
  priority: "우선 검토",
  normal: "일반",
  low: "낮은 우선순위",
};

/** Secondary label for BEST badge. */
export const AI_RECOMMEND_BEST_SUBLABEL = "특종 후보";

export const AI_RECOMMEND_MAX_BATCH = 30;

export const AI_RECOMMEND_LOOKBACK_MS = 48 * 60 * 60 * 1000;

const GRADE_ALIASES: Record<string, AiRecommendGrade> = {
  best: "best",
  scoop: "best",
  특종: "best",
  "특종 후보": "best",
  priority: "priority",
  high: "priority",
  "우선 검토": "priority",
  normal: "normal",
  medium: "normal",
  일반: "normal",
  low: "low",
  low_priority: "low",
  "낮은 우선순위": "low",
};

export function normalizeAiRecommendGrade(raw: unknown): AiRecommendGrade | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if ((AI_RECOMMEND_GRADES as readonly string[]).includes(key)) {
    return key as AiRecommendGrade;
  }
  return GRADE_ALIASES[key] ?? GRADE_ALIASES[raw.trim()] ?? null;
}

export function normalizeAiRecommendScore(raw: unknown): number | null {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeAiRecommendReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

export type ParsedAiRecommendItem = {
  id: string;
  grade: AiRecommendGrade;
  score: number;
  reason: string;
};

export function parseAiRecommendResponseItem(
  raw: unknown
): ParsedAiRecommendItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const grade = normalizeAiRecommendGrade(row.grade ?? row.tier ?? row.level);
  const score = normalizeAiRecommendScore(row.score ?? row.rating);
  const reason = normalizeAiRecommendReason(
    row.reason ?? row.why ?? row.rationale
  );
  if (!id || !grade || score == null || !reason) return null;
  return { id, grade, score, reason };
}

export function parseAiRecommendResponseItems(
  raw: unknown
): ParsedAiRecommendItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedAiRecommendItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = parseAiRecommendResponseItem(item);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out;
}

export function aiRecommendGradeRank(grade: AiRecommendGrade | null): number {
  switch (grade) {
    case "best":
      return 0;
    case "priority":
      return 1;
    case "normal":
      return 2;
    case "low":
      return 3;
    default:
      return 4;
  }
}

/** Sort: BEST → 우선 검토 → 일반 → 낮은 → 미평가, then newest. */
export function compareCandidatesByAiRecommend(
  a: {
    aiRecommendGrade: AiRecommendGrade | null;
    rssPublishedAt: string | null;
    createdAt?: string | null;
  },
  b: {
    aiRecommendGrade: AiRecommendGrade | null;
    rssPublishedAt: string | null;
    createdAt?: string | null;
  }
): number {
  const rankDiff =
    aiRecommendGradeRank(a.aiRecommendGrade) -
    aiRecommendGradeRank(b.aiRecommendGrade);
  if (rankDiff !== 0) return rankDiff;

  const aTime = Date.parse(a.rssPublishedAt || a.createdAt || "") || 0;
  const bTime = Date.parse(b.rssPublishedAt || b.createdAt || "") || 0;
  return bTime - aTime;
}

export function candidateFreshnessCutoffIso(
  nowMs = Date.now(),
  lookbackMs = AI_RECOMMEND_LOOKBACK_MS
): string {
  return new Date(nowMs - lookbackMs).toISOString();
}

export function isCandidateWithinLookback(input: {
  rssPublishedAt: string | null;
  createdAt: string;
  cutoffIso: string;
}): boolean {
  const stamp = input.rssPublishedAt?.trim() || input.createdAt;
  if (!stamp) return false;
  return stamp >= input.cutoffIso;
}

export const AI_RECOMMEND_SYSTEM_PROMPT =
  "You are a Miracle News desk triage assistant. Output JSON only: " +
  '{"items":[{"id":string,"grade":"best"|"priority"|"normal"|"low","score":number,"reason":string}]}.\n' +
  "Official beat priority (high→low): (1) US politics/economy (2) Korea politics/economy " +
  "(3) international diplomacy/security (4) science/society with large public impact " +
  "(5) lifestyle/culture/royalty/celebrity soft news.\n" +
  "Exceptions that may outrank the ladder: major disasters, war escalation, market shocks, " +
  "mass casualties, threats to state function/security, international events with direct Korean impact.\n" +
  "Rules:\n" +
  "- Use ONLY the provided RSS title and short summary. Do not invent facts.\n" +
  "- Do not request or assume article body, quotes, or unseen details.\n" +
  "- Prefer US stories that matter to Korean readers: White House/Congress, elections, " +
  "Fed/rates/inflation/jobs, tariffs/trade/industrial policy, markets/dollar/energy, " +
  "diplomacy/security/North Korea policy.\n" +
  "- grade best = unusually important scoop with clear impact + novelty + reliable framing; " +
  "priority = review first; normal = routine; low = soft news, thin interest, sports scores, gossip.\n" +
  "- Do NOT mark trivial political remarks as best just because the topic is politics/economy.\n" +
  "- Weigh: politics/economy relevance, US-policy→Korea impact, national impact, security, " +
  "market/household impact, magnitude, novelty/update value, viewpoint value, source reliability; " +
  "penalize duplicates and soft news.\n" +
  "- score is 0–100 overall desk priority.\n" +
  "- reason is one short Korean sentence (max ~120 chars) explaining the grade.\n" +
  "- Return one object per input id. Do not drop or invent ids.";

export function buildAiRecommendUserPayload(
  items: Array<{ id: string; title: string; summary: string; source: string }>
): string {
  return JSON.stringify({
    evaluate: items.map((item) => ({
      id: item.id,
      source: item.source,
      title: item.title,
      summary: item.summary,
    })),
  });
}
