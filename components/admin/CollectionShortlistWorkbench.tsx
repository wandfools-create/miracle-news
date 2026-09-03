"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  dismissFromShortlistAction,
  enrichFromShortlistAction,
  unshortlistFromShortlistAction,
} from "@/app/admin/(app)/collection-shortlist/actions";
import BulkCandidateEnrichResult from "@/components/admin/BulkCandidateEnrichResult";
import { useBulkCandidateEnrich } from "@/components/admin/useBulkCandidateEnrich";
import EnrichCandidateForm from "@/components/admin/EnrichCandidateForm";
import type { EnrichCandidateActionState } from "@/app/admin/(app)/collection-candidates/enrichCandidateAction";
import {
  AI_RECOMMEND_BEST_SUBLABEL,
  AI_RECOMMEND_GRADE_LABELS,
  type AiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";
import {
  getCandidateCategoryLabel,
  type CandidateCategoryKey,
} from "@/lib/collection-candidates/candidateCategory";
import { formatDateTimeKo } from "@/lib/articleWorkflow";

const SCROLL_KEY = "admin-cs-scroll-y";

const SOURCE_LABELS: Record<string, string> = {
  ap: "AP",
  "fox-news": "Fox",
  "pbs-newshour": "PBS",
  csm: "CSM",
  yonhap: "Yonhap",
  "yonhap-kr-radar": "연합뉴스 속보",
  "korea-herald": "Korea Herald",
  bbc: "BBC",
  sciencedaily: "ScienceDaily",
  chosun: "조선일보",
  tvchosun: "TV조선",
  insight: "인사이트",
};

export type ShortlistCard = {
  id: string;
  source: string;
  feedLabel: string | null;
  rssTitle: string;
  rssSummary: string | null;
  originalUrl: string;
  rssPublishedAt: string | null;
  candidateCategory: CandidateCategoryKey;
  aiRecommendGrade: AiRecommendGrade | null;
  aiRecommendScore: number | null;
  aiRecommendReason: string | null;
  enrichError: string | null;
  enrichStep: string | null;
  enrichCategory: string | null;
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
    requestAnimationFrame(() => window.scrollTo(0, y));
  } catch {
    /* ignore */
  }
}

export default function CollectionShortlistWorkbench({
  candidates,
}: {
  candidates: ShortlistCard[];
}) {
  const [rows, setRows] = useState(candidates);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkPending, startBulk] = useTransition();

  const listKey = candidates.map((c) => c.id).join(",");

  useEffect(() => {
    setRows(candidates);
    setSelected(new Set());
  }, [listKey, candidates]);

  const removeIdsFromView = useCallback((ids: string[]) => {
    const remove = new Set(ids);
    setRows((prev) => prev.filter((c) => !remove.has(c.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of remove) next.delete(id);
      return next;
    });
  }, []);

  const titlesById = useMemo(
    () => new Map(rows.map((c) => [c.id, c.rssTitle])),
    [rows]
  );

  const {
    running: enrichRunning,
    progress: enrichProgress,
    summary: enrichSummary,
    runBulkEnrich,
    dismissSummary: dismissEnrichSummary,
  } = useBulkCandidateEnrich({
    titlesById,
    onEnrichedIds: removeIdsFromView,
    onFailedIds: () => {},
  });

  useEffect(() => {
    restoreScroll();
  }, []);

  useEffect(() => {
    function onSubmitCapture(e: Event) {
      const target = e.target;
      if (!(target instanceof HTMLFormElement)) return;
      if (!target.closest("[data-cs-workbench]")) return;
      saveScroll();
    }
    document.addEventListener("submit", onSubmitCapture, true);
    return () => document.removeEventListener("submit", onSubmitCapture, true);
  }, []);

  const visibleIds = useMemo(() => rows.map((c) => c.id), [rows]);
  const selectedCount = selected.size;

  function runEnrichBulk() {
    if (selectedCount === 0 || enrichRunning) return;
    if (
      !window.confirm(
        `선택한 ${selectedCount}건을 기사로 만드시겠습니까? OpenAI 비용이 발생합니다.`
      )
    ) {
      return;
    }
    saveScroll();
    void runBulkEnrich([...selected]);
  }

  function retryFailedEnrichSelection() {
    if (!enrichSummary) return;
    const failedIds = enrichSummary.results
      .filter(
        (r) =>
          r.outcome === "enrich_failed" || r.outcome === "unexpected_error"
      )
      .map((r) => r.candidateId);
    setSelected(new Set(failedIds));
    dismissEnrichSummary();
  }

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  async function shortlistEnrichAction(
    _prev: EnrichCandidateActionState,
    formData: FormData
  ): Promise<EnrichCandidateActionState> {
    const result = await enrichFromShortlistAction(null, formData);
    if (result && !result.ok) {
      return {
        ok: false,
        error: result.error,
        step: result.step,
        categoryLabel: result.categoryLabel,
      };
    }
    return null;
  }

  function runBulk(
    action: (formData: FormData) => Promise<void>,
    confirmMessage?: string
  ) {
    if (selectedCount === 0) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    saveScroll();
    startBulk(() => {
      const fd = new FormData();
      for (const id of selected) fd.append("candidateIds", id);
      void action(fd);
    });
  }

  return (
    <div data-cs-workbench className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setSelected(new Set(visibleIds))}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
        >
          전체 선택
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
        >
          선택 해제
        </button>
        <span className="text-xs text-gray-500">
          {rows.length}건 · 선택 {selectedCount}
        </span>
      </div>

      {enrichProgress ? (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          전체 {enrichProgress.total}건 중 {enrichProgress.current}건 처리 중
          {enrichProgress.candidateTitle ? (
            <span className="mt-1 block text-xs text-blue-800">
              {enrichProgress.candidateTitle}
            </span>
          ) : null}
        </div>
      ) : null}

      {enrichSummary ? (
        <BulkCandidateEnrichResult
          summary={enrichSummary}
          onRetryFailed={retryFailedEnrichSelection}
          onDismiss={dismissEnrichSummary}
        />
      ) : null}

      <div className="space-y-2.5">
        {rows.map((c) => {
          const sourceLabel = c.feedLabel || SOURCE_LABELS[c.source] || c.source;
          return (
            <article
              key={c.id}
              className="rounded-xl border border-violet-100 bg-white px-3 py-2.5"
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
                  checked={selected.has(c.id)}
                  disabled={enrichRunning}
                  onChange={(e) => toggleOne(c.id, e.target.checked)}
                  aria-label="보관함 후보 선택"
                />
                <div className="min-w-0 flex-1">
                  {(c.aiRecommendGrade === "best" ||
                    c.aiRecommendGrade === "priority") && (
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      {c.aiRecommendGrade === "best" ? (
                        <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
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
                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-900">
                      선정됨
                    </span>
                    {c.rssPublishedAt ? (
                      <time
                        className="text-[11px] text-gray-500"
                        dateTime={c.rssPublishedAt}
                      >
                        {formatDateTimeKo(c.rssPublishedAt)}
                      </time>
                    ) : null}
                  </div>
                  <h2 className="mt-1 text-[15px] font-semibold leading-snug text-gray-900">
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
                  {c.enrichError ? (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800">
                      <span className="font-semibold">기사 만들기 실패</span>
                      {c.enrichCategory ? ` · ${c.enrichCategory}` : ""}
                      {c.enrichStep ? ` · ${c.enrichStep}` : ""}
                      <span className="mt-1 block">{c.enrichError}</span>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a
                      href={c.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
                    >
                      원문 보기
                    </a>
                    <EnrichCandidateForm
                      candidateId={c.id}
                      originalUrl={c.originalUrl}
                      status="all"
                      source="all"
                      date="all"
                      compact
                      retry={Boolean(c.enrichError)}
                      showManualByDefault={Boolean(c.enrichError)}
                      formActionOverride={shortlistEnrichAction}
                    />
                    <form action={unshortlistFromShortlistAction} className="inline-flex">
                      <input type="hidden" name="candidateId" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
                      >
                        보관함에서 되돌리기
                      </button>
                    </form>
                    <form action={dismissFromShortlistAction} className="inline-flex">
                      <input type="hidden" name="candidateId" value={c.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        제외
                      </button>
                    </form>
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
            <span className="mr-2 text-sm font-semibold">{selectedCount}건 선택</span>
            <button
              type="button"
              disabled={bulkPending || enrichRunning}
              onClick={runEnrichBulk}
              className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {enrichRunning ? "기사 만들기 진행 중…" : "선택 기사 만들기"}
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => runBulk(unshortlistFromShortlistAction)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              선택 되돌리기
            </button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => runBulk(dismissFromShortlistAction)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              선택 제외
            </button>
          </div>
        </div>
      ) : null}

      {selectedCount > 0 ? <div className="h-16" aria-hidden /> : null}
    </div>
  );
}
