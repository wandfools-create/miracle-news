"use client";

import { useActionState, useEffect, useState } from "react";

import {
  enrichCollectionCandidateAction,
  type EnrichCandidateActionState,
} from "@/app/admin/(app)/collection-candidates/enrichCandidateAction";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";

type Props = {
  candidateId: string;
  originalUrl?: string | null;
  status: string;
  source: string;
  date: string;
  category?: string;
  view?: string;
  advanced?: boolean;
  retry?: boolean;
  compact?: boolean;
  /** Show manual paste panel immediately (e.g. prior enrich_failed). */
  showManualByDefault?: boolean;
  /** Form action override (shortlist uses its own action). */
  formActionOverride?: (
    prev: EnrichCandidateActionState,
    formData: FormData
  ) => Promise<EnrichCandidateActionState>;
};

function isExtractionStyleFailure(state: EnrichCandidateActionState): boolean {
  if (!state || state.ok) return false;
  const blob = `${state.step ?? ""} ${state.error ?? ""} ${state.categoryLabel ?? ""}`;
  return /본문 추출|자료 부족|body.?extract|insufficient|원문/i.test(blob);
}

export default function EnrichCandidateForm({
  candidateId,
  originalUrl = null,
  status,
  source,
  date,
  category = "all",
  view = "ai",
  advanced = false,
  retry = false,
  compact = false,
  showManualByDefault = false,
  formActionOverride,
}: Props) {
  const [state, formAction, pending] = useActionState<
    EnrichCandidateActionState,
    FormData
  >(formActionOverride ?? enrichCollectionCandidateAction, null);

  const [manualOpen, setManualOpen] = useState(showManualByDefault || retry);
  const [manualBody, setManualBody] = useState("");
  const [forceCreate, setForceCreate] = useState(false);

  useEffect(() => {
    if (state && !state.ok && isExtractionStyleFailure(state)) {
      setManualOpen(true);
    }
  }, [state]);

  const charCount = manualBody.trim().length;

  return (
    <form
      action={formAction}
      className={
        compact
          ? "flex w-full max-w-xl flex-col items-stretch gap-2"
          : "flex w-full max-w-2xl flex-col items-stretch gap-2"
      }
    >
      <input type="hidden" name="candidateId" value={candidateId} />
      <CandidateFilterHiddenFields
        view={view}
        status={status}
        source={source}
        date={date}
        category={category}
        advanced={advanced}
      />

      <div className="flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className={
            compact
              ? "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
              : "rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
          }
        >
          {manualOpen ? "원문 입력 닫기" : "원문 직접 입력"}
        </button>
      </div>

      {state && !state.ok ? (
        <p className="max-w-xl text-xs text-red-700">
          {state.categoryLabel ? `${state.categoryLabel}: ` : ""}
          {state.error}
          {isExtractionStyleFailure(state) ? (
            <span className="mt-1 block text-amber-800">
              아래에서 원문을 붙여넣고 다시 시도할 수 있습니다.
            </span>
          ) : null}
        </p>
      ) : null}

      {manualOpen ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs font-semibold text-amber-950">원문 본문 직접 입력</p>
          {originalUrl ? (
            <p className="mt-1 break-all text-[11px] text-gray-600">
              원문 URL:{" "}
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {originalUrl}
              </a>
            </p>
          ) : null}
          <textarea
            name="manualSourceBody"
            value={manualBody}
            onChange={(e) => setManualBody(e.target.value)}
            rows={compact ? 6 : 10}
            placeholder="자동 추출에 실패한 원문 본문을 여기에 붙여넣으세요. 없는 사실을 추가하지 마세요."
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-5 text-gray-900"
          />
          <p className="mt-1 text-[11px] text-gray-600">
            붙여넣은 글자 수: {charCount.toLocaleString("ko-KR")}자
          </p>
          <label className="mt-2 flex items-start gap-2 text-xs text-gray-800">
            <input
              type="checkbox"
              name="adminForceCreate"
              value="true"
              checked={forceCreate}
              onChange={(e) => setForceCreate(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span>
              관리자 강제 기사화 — 길이·문단 기준과 관계없이 저장 (사실 창작·길이
              맞추기 재생성 없음). 짧은 기사 경고만 남깁니다.
            </span>
          </label>
          <button
            type="submit"
            disabled={pending || charCount === 0}
            className="mt-2 rounded-lg border border-black bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "기사 만드는 중…" : "직접 입력 내용으로 기사 만들기"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
