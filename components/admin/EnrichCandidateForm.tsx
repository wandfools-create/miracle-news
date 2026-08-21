"use client";

import { useActionState } from "react";

import {
  enrichCollectionCandidateAction,
  type EnrichCandidateActionState,
} from "@/app/admin/(app)/collection-candidates/enrichCandidateAction";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";

type Props = {
  candidateId: string;
  status: string;
  source: string;
  date: string;
  retry?: boolean;
};

export default function EnrichCandidateForm({
  candidateId,
  status,
  source,
  date,
  retry = false,
}: Props) {
  const [state, formAction, pending] = useActionState<
    EnrichCandidateActionState,
    FormData
  >(enrichCollectionCandidateAction, null);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-2">
      <input type="hidden" name="candidateId" value={candidateId} />
      <CandidateFilterHiddenFields status={status} source={source} date={date} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? "기사 만드는 중…"
          : retry
            ? "다시 시도"
            : "기사 만들기"}
      </button>
      {state && !state.ok ? (
        <p className="max-w-xs text-xs text-red-700">
          {state.categoryLabel ? `${state.categoryLabel}: ` : ""}
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
