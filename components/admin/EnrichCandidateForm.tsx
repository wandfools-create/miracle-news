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
  category?: string;
  view?: string;
  advanced?: boolean;
  retry?: boolean;
  compact?: boolean;
};

export default function EnrichCandidateForm({
  candidateId,
  status,
  source,
  date,
  category = "all",
  view = "ai",
  advanced = false,
  retry = false,
  compact = false,
}: Props) {
  const [state, formAction, pending] = useActionState<
    EnrichCandidateActionState,
    FormData
  >(enrichCollectionCandidateAction, null);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="candidateId" value={candidateId} />
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
        disabled={pending}
        className={
          compact
            ? "rounded-md bg-black px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            : "rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        }
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
