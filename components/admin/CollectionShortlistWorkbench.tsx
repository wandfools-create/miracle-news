"use client";

import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  bulkEnrichFromShortlistAction,
  dismissFromShortlistAction,
  enrichFromShortlistAction,
  unshortlistFromShortlistAction,
} from "@/app/admin/(app)/collection-shortlist/actions";
import { checkOriginalPreviewEmbeddable } from "@/app/admin/(app)/collection-candidates/checkPreviewEmbedAction";
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
  "korea-herald": "Korea Herald",
  bbc: "BBC",
  sciencedaily: "ScienceDaily",
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
};

type PreviewState = {
  candidateId: string;
  url: string;
  title: string;
  sourceLabel: string;
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
    requestAnimationFrame(() => window.scrollTo(0, y));
  } catch {
    /* ignore */
  }
}

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export default function CollectionShortlistWorkbench({
  candidates,
}: {
  candidates: ShortlistCard[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const [enrichState, enrichAction, enrichPending] = useActionState(
    enrichFromShortlistAction,
    null
  );

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

  const visibleIds = useMemo(() => candidates.map((c) => c.id), [candidates]);
  const selectedCount = selected.size;

  const toggleOne = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const openPreview = useCallback(async (c: ShortlistCard) => {
    if (isMobileViewport()) {
      window.open(c.originalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const sourceLabel = c.feedLabel || SOURCE_LABELS[c.source] || c.source;
    setPreview({
      candidateId: c.id,
      url: c.originalUrl,
      title: c.rssTitle,
      sourceLabel,
      embedAllowed: null,
    });
    const check = await checkOriginalPreviewEmbeddable(c.originalUrl);
    setPreview((prev) =>
      prev && prev.candidateId === c.id
        ? { ...prev, embedAllowed: check.allowed }
        : prev
    );
  }, []);

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
    <div
      data-cs-workbench
      className={`relative ${preview ? "lg:pr-[min(45%,28rem)] xl:pr-[42%]" : ""}`}
    >
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
          {candidates.length}건 · 선택 {selectedCount}
        </span>
      </div>

      {enrichState && !enrichState.ok ? (
        <p className="mb-2 text-xs text-red-700">{enrichState.error}</p>
      ) : null}

      <div className="space-y-2.5">
        {candidates.map((c) => {
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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void openPreview(c)}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50"
                    >
                      원문 보기
                    </button>
                    <form action={enrichAction} className="inline-flex">
                      <input type="hidden" name="candidateId" value={c.id} />
                      <button
                        type="submit"
                        disabled={enrichPending}
                        className="rounded-md bg-black px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {enrichPending ? "기사 만드는 중…" : "기사 만들기"}
                      </button>
                    </form>
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
              disabled={bulkPending}
              onClick={() =>
                runBulk(
                  bulkEnrichFromShortlistAction,
                  `선택한 ${selectedCount}건을 기사로 만드시겠습니까? OpenAI 비용이 발생합니다.`
                )
              }
              className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              선택 기사 만들기
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

      {preview ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setPreview(null)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-white shadow-xl sm:max-w-md lg:max-w-none lg:w-[min(45%,28rem)] xl:w-[42%]">
            <div className="flex items-start justify-between gap-2 border-b px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-500">
                  {preview.sourceLabel}
                </p>
                <p className="truncate text-sm font-semibold">{preview.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-md border px-2 py-1 text-xs"
              >
                닫기
              </button>
            </div>
            <div className="flex flex-wrap gap-2 border-b px-3 py-2">
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border px-2.5 py-1 text-xs font-medium"
              >
                새 탭에서 열기
              </a>
              <form action={enrichAction}>
                <input type="hidden" name="candidateId" value={preview.candidateId} />
                <button
                  type="submit"
                  disabled={enrichPending}
                  className="rounded-md bg-black px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  기사 만들기
                </button>
              </form>
            </div>
            <div className="min-h-0 flex-1 bg-gray-50">
              {preview.embedAllowed === false ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm font-medium">
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
