import Link from "next/link";
import {
  DUPLICATE_ANGLE_LABELS,
  type DuplicateAngleEvaluation,
} from "@/lib/duplicate/duplicateAngleTypes";

export default function DuplicateAngleReviewPanel({
  evaluation,
  candidateId,
  matchedArticleId,
}: {
  evaluation: DuplicateAngleEvaluation | null;
  candidateId: string;
  matchedArticleId?: string | null;
}) {
  if (!evaluation || evaluation.class === "ai-uncertain") return null;

  return (
    <aside className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <p className="font-semibold">
        중복·관점: {DUPLICATE_ANGLE_LABELS[evaluation.class]}
      </p>
      {evaluation.match ? (
        <p className="mt-1">
          기존: {evaluation.match.source} — {evaluation.match.title}
          {matchedArticleId || evaluation.match.id ? (
            <>
              {" "}
              <Link
                href={`/admin/review/${evaluation.match.id}`}
                className="font-medium underline"
              >
                열기
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <p className="mt-1">{evaluation.recommendedAction}</p>
      {evaluation.sharedFacts?.length ? (
        <p className="mt-1">공통: {evaluation.sharedFacts.join(", ")}</p>
      ) : null}
      {evaluation.perspectiveDiff ? (
        <p className="mt-1">관점 차이: {evaluation.perspectiveDiff}</p>
      ) : null}
      {evaluation.requiresOverride ? (
        <p className="mt-2 font-medium">
          기사 만들기 시 override 사유가 필요합니다 (candidate {candidateId.slice(0, 8)}…)
        </p>
      ) : null}
    </aside>
  );
}
