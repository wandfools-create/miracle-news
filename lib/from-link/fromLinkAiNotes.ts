import type { DraftCandidate } from "@/lib/from-link/types";
import {
  SHORT_ARTICLE_REVIEW_NOTE,
  THIN_SOURCE_MATERIAL_NOTE,
} from "@/lib/from-link/validateArticleQuality";

export function buildFromLinkAiReviewNotes(
  candidate: DraftCandidate,
  submittedOriginalUrl: string,
  options?: {
    shortSourceDraft?: boolean;
    shortArticleReview?: boolean;
    thinSourceMaterial?: boolean;
  }
): string {
  const shortSourceDraft = options?.shortSourceDraft === true;
  const shortArticleReview = options?.shortArticleReview === true;
  const thinSourceMaterial =
    options?.thinSourceMaterial === true || shortSourceDraft;

  return [
    "[from-link 후보 메타]",
    `편집 각도: ${candidate.angle}`,
    `한 줄 요약(후보): ${candidate.summary_one_line}`,
    `입력 URL(고정): ${submittedOriginalUrl}`,
    shortSourceDraft
      ? "[경고] 짧은 원문 기반 초안 — 길이만으로 실패시키지 않고 검토 대기로 저장했습니다. 원문·본문을 반드시 검토하세요."
      : null,
    shortArticleReview || shortSourceDraft
      ? `[경고] ${SHORT_ARTICLE_REVIEW_NOTE}`
      : null,
    thinSourceMaterial ? `[경고] ${THIN_SOURCE_MATERIAL_NOTE}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
