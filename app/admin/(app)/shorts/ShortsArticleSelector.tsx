"use client";

import { useMemo, useState } from "react";
import {
  isArticleRecommendedForDesk,
  SHORTS_MAX_ARTICLES,
  validateShortsArticleCount,
  type ShortsDesk,
} from "@/lib/shorts/shortsPolicy";

export type ShortsPublishedArticle = {
  id: string;
  source: string | null;
  source_country: string | null;
  title_ko: string | null;
  title_original: string | null;
  summary_ko: string | null;
  summary_original: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
};

function localDateKey(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayKey(): string {
  return localDateKey(new Date().toISOString());
}

export default function ShortsArticleSelector({
  articles,
}: {
  articles: ShortsPublishedArticle[];
}) {
  const [desk, setDesk] = useState<ShortsDesk>("morning");
  const [date, setDate] = useState(todayKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAllDesks, setShowAllDesks] = useState(false);

  const dated = useMemo(
    () => articles.filter((article) => localDateKey(article.published_at) === date),
    [articles, date]
  );
  const visible = useMemo(
    () =>
      showAllDesks
        ? dated
        : dated.filter((article) => isArticleRecommendedForDesk(article, desk)),
    [dated, desk, showAllDesks]
  );
  const validation = validateShortsArticleCount(selectedIds.length);

  function toggle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= SHORTS_MAX_ARTICLES) return current;
      return [...current, id];
    });
  }

  function changeDesk(next: ShortsDesk) {
    setDesk(next);
    setSelectedIds([]);
  }

  return (
    <div className="mt-8">
      <div className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-5 md:grid-cols-3">
        <label className="text-sm font-medium">
          회차
          <select
            value={desk}
            onChange={(event) => changeDesk(event.target.value as ShortsDesk)}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2"
          >
            <option value="morning">한눈 아침뉴스 · 미국/국제</option>
            <option value="evening">한눈 저녁뉴스 · 한국</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          기사 날짜
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSelectedIds([]);
            }}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={showAllDesks}
            onChange={(event) => setShowAllDesks(event.target.checked)}
          />
          다른 Desk 기사도 표시
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          선택 {selectedIds.length}/{SHORTS_MAX_ARTICLES} · 권장 3~5개
        </p>
        <button
          type="button"
          disabled={!validation.ok}
          title="다음 단계에서 AI 제작 패키지 생성 기능을 연결합니다."
          className="rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          제작안 생성 준비
        </button>
      </div>
      {!validation.ok ? (
        <p className="mt-2 text-sm text-amber-700">{validation.message}</p>
      ) : (
        <p className="mt-2 text-sm text-green-700">
          기사 선택이 완료되었습니다. AI 제작 패키지 연결 준비 상태입니다.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            선택한 날짜와 회차에 맞는 공개 기사가 없습니다. 다른 Desk 기사 표시를 켜거나 날짜를 바꿔보세요.
          </div>
        ) : (
          visible.map((article) => {
            const selected = selectedIds.includes(article.id);
            const title = article.title_ko || article.title_original || "제목 없음";
            const summary = article.summary_ko || article.summary_original || "요약 없음";
            return (
              <article
                key={article.id}
                className={`rounded-2xl border p-4 transition ${selected ? "border-black bg-gray-50" : "border-gray-200"}`}
              >
                <label className="flex cursor-pointer gap-4">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(article.id)}
                    className="mt-1 h-5 w-5"
                  />
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="hidden h-24 w-36 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:block">
                      {article.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={article.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500">
                        {article.source || "출처 미상"} · {article.published_at ? new Date(article.published_at).toLocaleString("ko-KR") : "발행 시각 없음"}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600">{summary}</p>
                    </div>
                  </div>
                </label>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
