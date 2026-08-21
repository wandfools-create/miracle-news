"use client";

import { useActionState } from "react";

import {
  localizePendingCandidatesAction,
  type LocalizeCandidatesActionState,
} from "@/app/admin/(app)/collection-candidates/localizeCandidatesAction";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";
import SelectAllReviewCheckbox from "@/app/admin/(app)/review/SelectAllReviewCheckbox";

type Props = {
  status: string;
  source: string;
  date: string;
};

export default function LocalizeCandidatesForm({
  status,
  source,
  date,
}: Props) {
  const [state, formAction, pending] = useActionState<
    LocalizeCandidatesActionState,
    FormData
  >(localizePendingCandidatesAction, null);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SelectAllReviewCheckbox
        targetName="candidateIds"
        label="한글화할 후보 전체 선택"
      />
      <form
        id="localize-candidates-form"
        action={formAction}
        className="flex flex-col items-start gap-2 sm:items-end"
      >
        <CandidateFilterHiddenFields status={status} source={source} date={date} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "한글화 중…" : "선택 항목 한글화"}
        </button>
        <p className="text-xs text-gray-500">
          체크한 후보의 제목·요약만 번역합니다. 기사 만들기는 한글화 없이 바로
          가능합니다.
        </p>
        {state && !state.ok ? (
          <p className="text-xs text-red-700">{state.error}</p>
        ) : null}
      </form>
    </div>
  );
}
