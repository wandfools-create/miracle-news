"use client";

import { useActionState } from "react";

import {
  recommendCandidatesAction,
  type RecommendCandidatesActionState,
} from "@/app/admin/(app)/collection-candidates/recommendCandidatesAction";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";

type Props = {
  view: string;
  status: string;
  source: string;
  date: string;
  category: string;
  advanced?: boolean;
  unevaluatedCount: number;
};

export default function RecommendCandidatesForm({
  view,
  status,
  source,
  date,
  category,
  advanced = false,
  unevaluatedCount,
}: Props) {
  const [state, formAction, pending] = useActionState<
    RecommendCandidatesActionState,
    FormData
  >(recommendCandidatesAction, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <CandidateFilterHiddenFields
        view={view}
        status={status}
        source={source}
        date={date}
        category={category}
        advanced={advanced}
      />
      <button
        type="submit"
        disabled={pending || unevaluatedCount === 0}
        className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-950 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "AI 추천 평가 중…"
          : unevaluatedCount === 0
            ? "신규 평가 대상 없음"
            : `AI 추천 갱신 (${Math.min(unevaluatedCount, 30)}건)`}
      </button>
      <span className="text-xs text-gray-500">
        페이지 로드 시 자동 호출 없음 · 미평가 신규만 · 저비용 모델
      </span>
      {state && !state.ok ? (
        <p className="w-full text-xs text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}
