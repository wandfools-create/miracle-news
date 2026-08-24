"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  bulkDismissCandidatesAction,
  bulkEnrichCandidatesAction,
  bulkExpireCandidatesAction,
  bulkShortlistCandidatesAction,
} from "@/app/admin/(app)/collection-candidates/bulkCandidateActions";
import { checkOriginalPreviewEmbeddable } from "@/app/admin/(app)/collection-candidates/checkPreviewEmbedAction";
import EnrichCandidateForm from "@/components/admin/EnrichCandidateForm";
import DismissCandidateForm from "@/components/admin/DismissCandidateForm";
import ShortlistCandidateForm from "@/components/admin/ShortlistCandidateForm";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";
import {
  localizePendingCandidatesAction,
  type LocalizeCandidatesActionState,
} from "@/app/admin/(app)/collection-candidates/localizeCandidatesAction";
import { useActionState } from "react";
import {
  getCandidateCategoryLabel,
  type CandidateCategoryKey,
} from "@/lib/collection-candidates/candidateCategory";
import {
  AI_RECOMMEND_BEST_SUBLABEL,
  AI_RECOMMEND_GRADE_LABELS,
  type AiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";
import {
  CANDIDATE_STATUS_LABELS,
  type CollectionCandidateStatus,
} from "@/lib/collection-candidates/types";
import { formatDateTimeKo } from "@/lib/articleWorkflow";
import { shortenCandidateFailure } from "@/lib/collection-candidates/candidateListQuery";

const SCROLL_KEY = "admin-cc-scroll-y";

const SOURCE_LABELS: Record<string, string> = {
  ap: "AP",
  "fox-news": "Fox",
  "pbs-newshour": "PBS",
  csm: "CSM",
  yonhap: "Yonhap",
  "korea-herald": "Korea Herald",
  bbc: "BBC",
  sciencedaily: "ScienceDaily",
};

export type WorkbenchCandidate = {
  id: string;
  source: string;
  feedLabel: string | null;
  rssTitle: string;
  rssSummary: string | null;
  hasKorean: boolean;
  originalUrl: string;
  rssPublishedAt: string | null;
  createdAt?: string | null;
  status: CollectionCandidateStatus;
  enrichError: string | null;
  enrichStep: string | null;
  articleId: string | null;
  candidateCategory: CandidateCategoryKey;
  aiRecommendGrade: AiRecommendGrade | null;
  aiRecommendScore: number | null;
  aiRecommendReason: string | null;
};

type Props = {
  candidates: WorkbenchCandidate[];
  viewFilter: string;
  statusFilter: string;
  sourceFilter: string;
  dateFilter: string;
  categoryFilter: string;
  showLocalizeTools: boolean;
};

type PreviewState = {
  candidateId: string;
  url: string;
  title: string;
  sourceLabel: string;
  canMakeArticle: boolean;
  embedAllowed: boolean | null;
};

function saveScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  } catch {
    /* ignore */
  }
}

function restoreScroll() {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw == null) return;
    const y = Number.parseInt(raw, 10);
    if (!Number.isFinite(y) || y < 0) return;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  } catch {
    /* ignore */
  }
}

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export default function CollectionCandidatesWorkbench({
  candidates,
  viewFilter,
  statusFilter,
  sourceFilter,
  dateFilter,
  categoryFilter,
  showLocalizeTools,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const [localizeState, localizeAction, localizePending] = useActionState<
    LocalizeCandidatesActionState,
    FormData
  >(localizePendingCandidatesAction, null);

  useEffect(() => {
    restoreScroll();
  }, []);

  useEffect(() => {
    function onSubmitCapture(e: Event) {
      const target = e.target;
      if (!(target instanceof HTMLFormElement)) return;
      if (!target.closest("[data-cc-workbench]")) return;
      saveScroll();
    }
    document.addEventListener("submit", onSubmitCapture, true);
    return () => document.removeEventListener("submit", onSubmitCapture, true);
  }, []);

  const visibleIds = useMemo(
    () => candidates.map((c) => c.id),
    [candidates]
  );

  const selectedCount = selected.size;

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectVisible = useCallback(() => {
    setSelected(new Set(visibleIds));
  }, [visibleIds]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const openPreview = useCallback(async (c: WorkbenchCandidate) => {
    if (isMobileViewport()) {
      window.open(c.originalUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const sourceLabel = c.feedLabel || SOURCE_LABELS[c.source] || c.source;
    const canMakeArticle =
      c.status === "pending" ||
      c.status === "enrich_failed" ||
      c.status === "enriching";

    setPreview({
      candidateId: c.id,
      url: c.originalUrl,
      title: c.rssTitle,
      sourceLabel,
      canMakeArticle,
      embedAllowed: null,
    });

    const check = await checkOriginalPreviewEmbeddable(c.originalUrl);
    setPreview((prev) =>
      prev && prev.candidateId === c.id
        ? { ...prev, embedAllowed: check.allowed }
        : prev
    );
  }, []);

  const closePreview = useCallback(() => setPreview(null), []);

  function appendSelectedToForm(form: HTMLFormElement) {
    form.querySelectorAll('input[data-bulk-id="1"]').forEach((el) => el.remove());
    for (const id of selected) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "candidateIds";
      input.value = id;
      input.dataset.bulkId = "1";
      form.appendChild(input);
    }
  }

  function runBulk(
    action: (formData: FormData) => Promise<void>,
    confirmMessage?: string
  ) {
    if (selectedCount === 0) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    saveScroll();
    startBulk(() => {
      const form = document.getElementById(
        "cc-bulk-form"
      ) as HTMLFormElement | null;
      if (!form) return;
      appendSelectedToForm(form);
      const fd = new FormData(form);
      void action(fd);
    });
  }

  const renderFilterFields = () => (
    <CandidateFilterHiddenFields
      view={viewFilter}
      status={statusFilter}
      source={sourceFilter}
      date={dateFilter}
      category={categoryFilter}
      advanced={showLocalizeTools}
    />
  );

  return (
    <div
      data-cc-workbench
      className={`relative ${preview ? "lg:pr-[min(45%,28rem)] xl:pr-[42%]" : ""}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={selectVisible}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          현재 화면 전체 선택
        </button>
        <button
          type="button"
          onClick={selectVisible}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          현재 필터 결과 전체 선택
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          전체 선택 해제
        </button>
        <span className="text-xs text-gray-500">
          {candidates.length}건 · 선택 {selectedCount}
        </span>
      </div>

      <form id="cc-bulk-form" className="hidden" aria-hidden>
        {renderFilterFields()}
      </form>

      {showLocalizeTools ? (
        <form
          id="localize-candidates-form"
          action={localizeAction}
          className="mb-3 hidden"
          onSubmit={() => {
            saveScroll();
            const form = document.getElementById(
              "localize-candidates-form"
            ) as HTMLFormElement | null;
            if (!form) return;
            form
              .querySelectorAll('input[name="candidateIds"]')
              .forEach((el) => el.remove());
            for (const id of selected) {
              const input = document.createElement("input");
              input.type = "hidden";
              input.name = "candidateIds";
              input.value = id;
              form.appendChild(input);
            }
          }}
        >
          {renderFilterFields()}
        </form>
      ) : null}

      {localizeState && !localizeState.ok ? (
        <p className="mb-2 text-xs text-red-700">{localizeState.error}</p>
      ) : null}

      <div className="space-y-2.5">
        {candidates.map((c) => {
          const sourceLabel = c.feedLabel || SOURCE_LABELS[c.source] || c.source;
          const statusLabel = CANDIDATE_STATUS_LABELS[c.status] ?? c.status;
          const canMakeArticle =
            c.status === "pending" ||
            c.status === "shortlisted" ||
            c.status === "enrich_failed" ||
            c.status === "enriching";
          const canDismiss =
            c.status === "pending" ||
            c.status === "shortlisted" ||
            c.status === "enrich_failed" ||
            c.status === "enriching" ||
            c.status === "selected";
          const canShortlist =
            c.status === "pending" ||
            c.status === "enrich_failed" ||
            c.status === "enriching";
          const emphasizeShortlist =
            c.aiRecommendGrade === "best" || c.aiRecommendGrade === "priority";
          const failureText = shortenCandidateFailure(c.enrichError, 100);
          const checked = selected.has(c.id);

          return (
            <article
              key={c.id}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:px-3.5"
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
                  checked={checked}
                  onChange={(e) => toggleOne(c.id, e.target.checked)}
                  aria-label="후보 선택"
                />
                <div className="min-w-0 flex-1">
                  {(c.aiRecommendGrade === "best" ||
                    c.aiRecommendGrade === "priority") && (
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {c.aiRecommendGrade === "best" ? (
                        <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
                          BEST · {AI_RECOMMEND_BEST_SUBLABEL}
                        </span>
                      ) : (
                        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                          {AI_RECOMMEND_GRADE_LABELS.priority}
                        </span>
                      )}
                      {typeof c.aiRecommendScore === "number" ? (
                        <span className="text-[11px] font-semibold text-gray-600">
                          {c.aiRecommendScore}점
                        </span>
                      ) : null}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">
                      {sourceLabel}
                    </span>
                    <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                      {getCandidateCategoryLabel(c.candidateCategory)}
                    </span>
                    {c.aiRecommendGrade &&
                    c.aiRecommendGrade !== "best" &&
                    c.aiRecommendGrade !== "priority" ? (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">
                        {AI_RECOMMEND_GRADE_LABELS[c.aiRecommendGrade]}
                        {typeof c.aiRecommendScore === "number"
                          ? ` · ${c.aiRecommendScore}`
                          : ""}
                      </span>
                    ) : null}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        c.status === "pending"
                          ? "bg-blue-50 text-blue-800"
                          : c.status === "shortlisted"
                            ? "bg-violet-100 text-violet-900"
                          : c.status === "enrich_failed"
                            ? "bg-red-50 text-red-800"
                            : c.status === "enriched"
                              ? "bg-green-50 text-green-800"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        c.hasKorean
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-900"
                      }`}
                    >
                      {c.hasKorean ? "한글화됨" : "영문"}
                    </span>
                    {c.rssPublishedAt ? (
                      <time
                        className="text-[11px] text-gray-500"
                        dateTime={c.rssPublishedAt}
                      >
                        {formatDateTimeKo(c.rssPublishedAt)}
                      </time>
                    ) : (
                      <span className="text-[11px] text-gray-400">발행시각 없음</span>
                    )}
                  </div>

                  <h2 className="mt-1 text-[15px] font-semibold leading-snug text-gray-900 sm:text-base">
                    {c.rssTitle}
                  </h2>
                  {c.aiRecommendReason ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-violet-800">
                      추천: {c.aiRecommendReason}
                    </p>
                  ) : null}
                  {c.rssSummary ? (
                    <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-gray-600">
                      {c.rssSummary}
                    </p>
                  ) : null}

                  {c.status === "enrich_failed" && failureText ? (
                    <p className="mt-1.5 text-xs text-red-700">
                      {c.enrichStep ? `${c.enrichStep}: ` : ""}
                      {failureText}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void openPreview(c)}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                    >
                      원문 보기
                    </button>
                    {canShortlist ? (
                      <ShortlistCandidateForm
                        candidateId={c.id}
                        view={viewFilter}
                        status={statusFilter}
                        source={sourceFilter}
                        date={dateFilter}
                        category={categoryFilter}
                        advanced={showLocalizeTools}
                        compact
                        emphasize={emphasizeShortlist}
                      />
                    ) : null}
                    {canMakeArticle ? (
                      <EnrichCandidateForm
                        candidateId={c.id}
                        view={viewFilter}
                        status={statusFilter}
                        source={sourceFilter}
                        date={dateFilter}
                        category={categoryFilter}
                        advanced={showLocalizeTools}
                        retry={
                          c.status === "enrich_failed" || c.status === "enriching"
                        }
                        compact
                      />
                    ) : null}
                    {c.status === "enriched" && c.articleId ? (
                      <a
                        href={`/admin/review/${c.articleId}`}
                        className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-900 hover:bg-green-100"
                      >
                        검토 대기
                      </a>
                    ) : null}
                    {canDismiss ? (
                      <DismissCandidateForm
                        candidateId={c.id}
                        view={viewFilter}
                        status={statusFilter}
                        source={sourceFilter}
                        date={dateFilter}
                        category={categoryFilter}
                        advanced={showLocalizeTools}
                        compact
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-3 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-semibold text-gray-900">
              {selectedCount}건 선택
            </span>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() =>
                runBulk(bulkShortlistCandidatesAction, undefined)
              }
              className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50"
            >
              선택 항목 보관함에 담기
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() =>
                runBulk(bulkDismissCandidatesAction, undefined)
              }
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              선택 제외
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() =>
                runBulk(
                  bulkExpireCandidatesAction,
                  `선택한 ${selectedCount}건을 보관/만료 처리할까요? (OpenAI 비용 없음)`
                )
              }
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              선택 후보 보관/만료
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() =>
                runBulk(
                  bulkEnrichCandidatesAction,
                  `선택한 ${selectedCount}건을 기사로 만드시겠습니까? OpenAI 비용이 발생합니다.`
                )
              }
              className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              선택 기사 만들기
            </button>
            {showLocalizeTools ? (
              <button
                type="submit"
                form="localize-candidates-form"
                disabled={localizePending || bulkPending}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {localizePending ? "한글화 중…" : "선택 한글화"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearSelection}
              className="ml-auto text-sm text-gray-500 underline"
            >
              선택 해제
            </button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={closePreview}
            aria-hidden
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-200 bg-white shadow-xl sm:max-w-md lg:max-w-none lg:w-[min(45%,28rem)] xl:w-[42%]"
            role="dialog"
            aria-label="원문 미리보기"
          >
            <div className="flex items-start justify-between gap-2 border-b border-gray-200 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-500">
                  {preview.sourceLabel}
                </p>
                <p className="truncate text-sm font-semibold text-gray-900">
                  {preview.title}
                </p>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-gray-100 px-3 py-2">
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
              >
                새 탭에서 열기
              </a>
              {preview.canMakeArticle ? (
                <EnrichCandidateForm
                  candidateId={preview.candidateId}
                  view={viewFilter}
                  status={statusFilter}
                  source={sourceFilter}
                  date={dateFilter}
                  category={categoryFilter}
                  advanced={showLocalizeTools}
                  compact
                />
              ) : null}
            </div>
            <div className="min-h-0 flex-1 bg-gray-50">
              {preview.embedAllowed === false ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm font-medium text-gray-800">
                    이 언론사는 내부 미리보기를 허용하지 않습니다
                  </p>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                  >
                    새 탭에서 원문 열기
                  </a>
                </div>
              ) : preview.embedAllowed === null ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  미리보기 확인 중…
                </div>
              ) : (
                <iframe
                  title="원문 미리보기"
                  src={preview.url}
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          </aside>
        </>
      ) : null}

      {selectedCount > 0 ? <div className="h-16" aria-hidden /> : null}
    </div>
  );
}
