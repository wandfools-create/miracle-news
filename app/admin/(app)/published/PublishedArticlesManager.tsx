"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import EditorialPriorityBadge from "@/components/admin/EditorialPriorityBadge";
import EditorialPriorityForm from "@/components/admin/EditorialPriorityForm";
import { setEditorialPriorityFromForm } from "@/lib/admin/setEditorialPriority";
import {
  bulkSendToRevisionFromPublished,
  bulkUnpublishArticles,
  clearMainNewsFromPublished,
  sendToRevisionFromPublished,
  setMainNewsFromPublished,
  unpublishArticle,
} from "./actions";

type ArticleRow = {
  id: string;
  source: string;
  sourceLabel: string;
  original_url: string | null;
  title_original: string | null;
  title_translated: string | null;
  title_ko: string | null;
  summary_original: string | null;
  summary_translated: string | null;
  summary_ko: string | null;
  category: string | null;
  categoryLabel: string;
  status: string | null;
  review_status: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  created_at: string;
  is_top_story: boolean;
  top_story_order: number;
  editorial_priority: string;
  effectiveDate: string;
};

type QuickRange = "all" | "today" | "yesterday" | "last7";

type Props = {
  articles: ArticleRow[];
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatGroupDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function matchesQuickRange(dateKey: string, range: QuickRange): boolean {
  if (range === "all") return true;

  const now = new Date();
  const today = toDateKey(now);
  if (range === "today") return dateKey === today;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);
  if (range === "yesterday") return dateKey === yesterdayKey;

  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return parsed.getTime() >= start.getTime();
}

export default function PublishedArticlesManager({ articles }: Props) {
  const [query, setQuery] = useState("");
  const [pickedDate, setPickedDate] = useState("");
  const [quickRange, setQuickRange] = useState<QuickRange>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((article) => {
      if (pickedDate && article.effectiveDate !== pickedDate) return false;
      if (!matchesQuickRange(article.effectiveDate, quickRange)) return false;
      if (!q) return true;

      const haystack = [
        article.title_ko,
        article.title_translated,
        article.title_original,
        article.source,
        article.sourceLabel,
        article.category,
        article.categoryLabel,
        article.original_url,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [articles, pickedDate, query, quickRange]);

  const grouped = useMemo(() => {
    const map = new Map<string, ArticleRow[]>();
    for (const article of filtered) {
      const key = article.effectiveDate;
      const list = map.get(key) ?? [];
      list.push(article);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  const filteredIds = useMemo(() => filtered.map((a) => a.id), [filtered]);
  const allFilteredChecked =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllFiltered(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <div className="mt-6 sm:mt-8">
      <section className="rounded-2xl border bg-gray-50 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            검색
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목 · 출처 · 카테고리 · 원문 URL"
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-black"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            날짜 필터
            <input
              type="date"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-black"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ["today", "오늘"],
            ["yesterday", "어제"],
            ["last7", "최근 7일"],
            ["all", "전체"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setQuickRange(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                quickRange === id
                  ? "border-black bg-black text-white"
                  : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
          {(pickedDate || query) && (
            <button
              type="button"
              onClick={() => {
                setPickedDate("");
                setQuery("");
                setQuickRange("all");
              }}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
            >
              필터 초기화
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-600">
          표시 {filtered.length}건 / 전체 {articles.length}건
        </p>
      </section>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={allFilteredChecked}
              onChange={(e) => toggleAllFiltered(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            현재 필터 결과 전체 선택
          </label>
          <span className="text-sm text-gray-600">
            선택 {selectedIds.size}건
          </span>

          <form action={bulkUnpublishArticles}>
            {[...selectedIds].map((id) => (
              <input key={`u-${id}`} type="hidden" name="articleIds" value={id} />
            ))}
            <button
              type="submit"
              disabled={selectedIds.size === 0}
              className="rounded-xl border border-gray-400 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택 기사 공개 취소
            </button>
          </form>

          <form action={bulkSendToRevisionFromPublished}>
            {[...selectedIds].map((id) => (
              <input key={`r-${id}`} type="hidden" name="articleIds" value={id} />
            ))}
            <button
              type="submit"
              disabled={selectedIds.size === 0}
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              선택 기사 수정 대기
            </button>
          </form>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border p-5 text-sm text-gray-600 sm:p-6 sm:text-base">
          조건에 맞는 공개 기사가 없습니다.
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped.map(([dateKey, list]) => (
            <section key={dateKey}>
              <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-2">
                <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
                  {formatGroupDate(dateKey)}
                </h2>
                <span className="text-xs text-gray-500">{list.length}건</span>
              </div>

              <div className="grid gap-3 sm:gap-4">
                {list.map((article) => (
                  <article key={article.id} className="rounded-2xl border p-4 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-4 sm:gap-5 md:flex-row md:items-start">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(article.id)}
                          onChange={(e) => toggleOne(article.id, e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                        <div className="h-24 w-full rounded-xl bg-gray-100 sm:h-28 md:w-44">
                          {article.thumbnail_url ? (
                            <img
                              src={article.thumbnail_url}
                              alt={
                                article.title_ko ||
                                article.title_translated ||
                                article.title_original ||
                                "기사 썸네일"
                              }
                              className="h-full w-full rounded-xl object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-gray-400">
                              이미지 없음
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 sm:text-xs">
                          <span>{article.sourceLabel}</span>
                          <span>·</span>
                          <span>{article.categoryLabel}</span>
                          <span>·</span>
                          <span>공개됨</span>
                          {article.is_top_story ? (
                            <>
                              <span>·</span>
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                                메인 뉴스
                              </span>
                            </>
                          ) : null}
                          <EditorialPriorityBadge
                            value={article.editorial_priority}
                          />
                        </div>

                        <h3 className="mt-3 break-words text-lg font-semibold leading-7 sm:text-xl">
                          {article.title_ko ||
                            article.title_translated ||
                            article.title_original}
                        </h3>

                        <p className="mt-2 break-words text-sm leading-6 text-gray-600">
                          {article.summary_ko ||
                            article.summary_translated ||
                            article.summary_original ||
                            "요약이 없습니다."}
                        </p>

                        <p className="mt-2 break-words text-sm leading-6 text-gray-500">
                          원문 제목: {article.title_original || "-"}
                        </p>

                        <p className="mt-1 break-all text-xs leading-5 text-gray-500">
                          원문 URL: {article.original_url || "-"}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:text-sm">
                          <span>기준 날짜: {formatGroupDate(article.effectiveDate)}</span>
                          <span>·</span>
                          <span>공개 시각: {article.published_at ? formatDateTime(article.published_at) : "없음"}</span>
                          <span>·</span>
                          <span>status: {article.status || "없음"}</span>
                          <span>·</span>
                          <span>review: {article.review_status || "없음"}</span>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <Link
                            href={`/admin/review/${article.id}`}
                            className="text-sm font-medium text-blue-600 underline"
                          >
                            기사 상세 이동
                          </Link>

                          <EditorialPriorityForm
                            articleId={article.id}
                            current={article.editorial_priority}
                            action={setEditorialPriorityFromForm}
                            compact
                          />

                          <form action={unpublishArticle}>
                            <input type="hidden" name="articleId" value={article.id} />
                            <button
                              type="submit"
                              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                            >
                              공개 취소
                            </button>
                          </form>

                          <form action={sendToRevisionFromPublished}>
                            <input type="hidden" name="articleId" value={article.id} />
                            <button
                              type="submit"
                              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                            >
                              수정 대기 보내기
                            </button>
                          </form>

                          {article.is_top_story ? (
                            <form action={clearMainNewsFromPublished}>
                              <input type="hidden" name="articleId" value={article.id} />
                              <button
                                type="submit"
                                className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50"
                              >
                                메인 뉴스 해제
                              </button>
                            </form>
                          ) : (
                            <form action={setMainNewsFromPublished}>
                              <input type="hidden" name="articleId" value={article.id} />
                              <button
                                type="submit"
                                className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
                              >
                                메인 뉴스 지정
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
