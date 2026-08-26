"use client";

import { useMemo, useState } from "react";
import {
  formatAmericaNewYorkDateKey,
  CRON_TIMEZONE,
} from "@/lib/cron/americaNewYork";
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

function todayEditDateKey(): string {
  return formatAmericaNewYorkDateKey(new Date());
}

export default function ShortsArticleSelector({
  articles,
}: {
  articles: ShortsPublishedArticle[];
}) {
  const [desk, setDesk] = useState<ShortsDesk>("morning");
  const [date, setDate] = useState(todayEditDateKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAllDesks, setShowAllDesks] = useState(false);

  const dated = useMemo(
    () =>
      articles.filter(
        (article) => formatAmericaNewYorkDateKey(article.published_at) === date
      ),
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
          기사 날짜 ({CRON_TIMEZONE})
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
      </div>
      {!validation.ok ? (
        <p className="mt-2 text-sm text-amber-700">{validation.message}</p>
      ) : (
        <p className="mt-2 text-sm text-green-700">
          기사 {selectedIds.length}개 선택 완료. (Phase 1 — 선택만 저장되며 서버에 기록되지 않습니다.)
        </p>
      )}

      <div
        className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700"
        role="status"
      >
        <p className="font-semibold text-gray-900">AI 대본 생성 — 다음 단계</p>
        <p className="mt-1">
          Phase 1에서는 공개 기사 조회와 3~5개 선택만 제공합니다. Hook·나레이션·자막·화면
          구성안 AI 생성은 아직 연결되지 않았습니다.
        </p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="AI 대본 생성은 다음 단계에서 연결됩니다."
          className="mt-3 cursor-not-allowed rounded-xl bg-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-600"
        >
          AI 대본 생성 (다음 단계)
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            선택한 날짜와 회차에 맞는 공개 기사가 없습니다. 다른 Desk 기사 표시를 켜거나
            날짜를 바꿔보세요.
          </div>
        ) : (
          visible.map((article) => {
            const selected = selectedIds.includes(article.id);
            const title = article.title_ko || article.title_original || "제목 없음";
            const summary = article.summary_ko || article.summary_original || "요약 없음";
            const publishedLabel = article.published_at
              ? new Intl.DateTimeFormat("ko-KR", {
                  timeZone: CRON_TIMEZONE,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(article.published_at))
              : "발행 시각 없음";
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
                        {article.source || "출처 미상"} · {publishedLabel} ({CRON_TIMEZONE})
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
