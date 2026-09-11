import {
  normalizeAiRecommendGrade,
  type AiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";
import {
  NEWS_WIRE_VERY_RECENT_MS,
} from "@/lib/news-wire/types";

/**
 * Public wire sort (locale-neutral):
 * 1. High AI grade (best/priority), higher score first
 * 2. Unevaluated but very recent
 * 3. Normal grade
 * 4. Older unevaluated
 * 5. Low grade
 * Then time DESC, id ASC for stable KO/EN parity.
 */
export function newsWireRankBucket(
  input: {
    aiRecommendGrade: AiRecommendGrade | null;
    createdAt: string;
  },
  nowMs = Date.now(),
  veryRecentMs = NEWS_WIRE_VERY_RECENT_MS
): number {
  const grade = input.aiRecommendGrade;
  const age = nowMs - (Date.parse(input.createdAt) || 0);
  const veryRecent = age >= 0 && age <= veryRecentMs;

  if (grade === "best" || grade === "priority") return 0;
  if (!grade && veryRecent) return 1;
  if (grade === "normal") return 2;
  if (!grade) return 3;
  if (grade === "low") return 4;
  return 3;
}

export function compareNewsWireItems(
  a: {
    id: string;
    aiRecommendGrade: AiRecommendGrade | null;
    aiRecommendScore: number | null;
    publishedAt: string | null;
    collectedAt: string;
  },
  b: {
    id: string;
    aiRecommendGrade: AiRecommendGrade | null;
    aiRecommendScore: number | null;
    publishedAt: string | null;
    collectedAt: string;
  },
  nowMs = Date.now()
): number {
  const bucketDiff =
    newsWireRankBucket(
      { aiRecommendGrade: a.aiRecommendGrade, createdAt: a.collectedAt },
      nowMs
    ) -
    newsWireRankBucket(
      { aiRecommendGrade: b.aiRecommendGrade, createdAt: b.collectedAt },
      nowMs
    );
  if (bucketDiff !== 0) return bucketDiff;

  const scoreDiff = (b.aiRecommendScore ?? -1) - (a.aiRecommendScore ?? -1);
  if (scoreDiff !== 0) return scoreDiff;

  const aTime =
    Date.parse(a.publishedAt || a.collectedAt) ||
    Date.parse(a.collectedAt) ||
    0;
  const bTime =
    Date.parse(b.publishedAt || b.collectedAt) ||
    Date.parse(b.collectedAt) ||
    0;
  if (bTime !== aTime) return bTime - aTime;

  return a.id.localeCompare(b.id);
}

export function parseWireGrade(raw: string | null | undefined): AiRecommendGrade | null {
  return normalizeAiRecommendGrade(raw);
}
