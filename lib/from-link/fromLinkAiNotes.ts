import type { DraftCandidate } from "@/lib/from-link/types";

export function buildFromLinkAiReviewNotes(
  candidate: DraftCandidate,
  submittedOriginalUrl: string,
  shortSourceDraft?: boolean
): string {
  return [
    "[from-link 후보 메타]",
    `편집 각도: ${candidate.angle}`,
    `한 줄 요약(후보): ${candidate.summary_one_line}`,
    `입력 URL(고정): ${submittedOriginalUrl}`,
    shortSourceDraft
      ? "[경고] 짧은 원문 기반 초안 — 생성 본문이 일반 품질 기준(900자·5문단) 미만일 수 있음. 원문·본문을 반드시 검토하세요."
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}
