/**
 * Candidate AI recommend → article snapshot helpers (no OpenAI).
 * Grade meanings stay on the recommend scale; do not coerce best→breaking.
 */
import {
  normalizeAiRecommendGrade,
  type AiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";

export type { AiRecommendGrade };

const GRADE_RANK: Record<AiRecommendGrade, number> = {
  best: 4,
  priority: 3,
  normal: 2,
  low: 1,
};

export function normalizeStoredAiRecommendGrade(
  value: unknown
): AiRecommendGrade | null {
  if (value == null || value === "") return null;
  return normalizeAiRecommendGrade(value);
}

export function normalizeStoredAiRecommendScore(
  value: unknown
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Fields to persist on articles when the snapshot migration is applied. */
export function aiRecommendSnapshotForInsert(input: {
  grade?: unknown;
  score?: unknown;
}): {
  ai_recommend_grade: AiRecommendGrade | null;
  ai_recommend_score: number | null;
} {
  return {
    ai_recommend_grade: normalizeStoredAiRecommendGrade(input.grade),
    ai_recommend_score: normalizeStoredAiRecommendScore(input.score),
  };
}

export type CandidateGradeRow = {
  article_id: string | null;
  ai_recommend_grade: string | null;
  ai_recommend_score: number | null;
};

/**
 * When multiple candidates share one article_id, pick the strongest grade,
 * then highest score, then stable string tie-break (deterministic).
 */
export function pickBestCandidateGradeRow(
  rows: CandidateGradeRow[]
): CandidateGradeRow | null {
  let best: CandidateGradeRow | null = null;
  let bestRank = -1;
  let bestScore = -1;
  let bestKey = "";

  for (const row of rows) {
    if (!row.article_id) continue;
    const grade = normalizeStoredAiRecommendGrade(row.ai_recommend_grade);
    const rank = grade ? GRADE_RANK[grade] : 0;
    const score = normalizeStoredAiRecommendScore(row.ai_recommend_score) ?? -1;
    const key = `${row.ai_recommend_grade ?? ""}:${row.ai_recommend_score ?? ""}`;
    if (
      rank > bestRank ||
      (rank === bestRank && score > bestScore) ||
      (rank === bestRank && score === bestScore && key.localeCompare(bestKey) < 0)
    ) {
      best = row;
      bestRank = rank;
      bestScore = score;
      bestKey = key;
    }
  }
  return best;
}
