import type { DraftCandidate } from "@/lib/from-link/types";
import { SHORT_ARTICLE_REVIEW_NOTE } from "@/lib/from-link/validateArticleQuality";

export function buildFromLinkAiReviewNotes(
  candidate: DraftCandidate,
  submittedOriginalUrl: string,
  options?: {
    shortSourceDraft?: boolean;
    shortArticleReview?: boolean;
  }
): string {
  const shortSourceDraft = options?.shortSourceDraft === true;
  const shortArticleReview = options?.shortArticleReview === true;

  return [
    "[from-link 후보 메타]",
    `편집 각도: ${candidate.angle}`,
    `한 줄 요약(후보): ${candidate.summary_one_line}`,
    `입력 URL(고정): ${submittedOriginalUrl}`,
    shortSourceDraft
      ? "[경고] 짧은 원문 기반 초안 — 생성 본문이 최소 길이(500자) 또는 내용 품질 기준을 못 맞춰 완화 저장했습니다. 원문·본문을 반드시 검토하세요."
      : null,
    shortArticleReview ? `[경고] ${SHORT_ARTICLE_REVIEW_NOTE}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
