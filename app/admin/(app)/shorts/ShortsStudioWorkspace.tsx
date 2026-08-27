"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { generateShortsPackageAction } from "./actions";
import type { ShortsProductionPackageRecord } from "@/lib/shorts/shortsPackageTypes";

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

function deskLabel(desk: ShortsDesk): string {
  return desk === "morning" ? "아침뉴스" : "저녁뉴스";
}

export default function ShortsStudioWorkspace({
  articles,
  recentPackages,
  storeBlocked = false,
  storeError = null,
}: {
  articles: ShortsPublishedArticle[];
  recentPackages: ShortsProductionPackageRecord[];
  storeBlocked?: boolean;
  storeError?: string | null;
}) {
  const router = useRouter();
  const [desk, setDesk] = useState<ShortsDesk>("morning");
  const [date, setDate] = useState(todayEditDateKey);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAllDesks, setShowAllDesks] = useState(false);
  const [error, setError] = useState<string | null>(storeError);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
  const canGenerate = validation.ok && !pending && !storeBlocked;

  function toggle(id: string) {
    if (storeBlocked) return;
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= SHORTS_MAX_ARTICLES) return current;
      return [...current, id];
    });
  }

  function changeDesk(next: ShortsDesk) {
    setDesk(next);
    setSelectedIds([]);
    setError(storeError);
    setNotice(null);
  }

  function handleGenerate() {
    if (!canGenerate) return;
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.set("desk", desk);
    formData.set("editDate", date);
    formData.set("articleIds", JSON.stringify(selectedIds));

    startTransition(async () => {
      const result = await generateShortsPackageAction(formData);
      if (!result.ok) {
        const dupNote =
          result.removedDuplicates && result.removedDuplicates.length > 0
            ? `\n제거된 중복: ${result.removedDuplicates.map((d) => d.id).join(", ")}`
            : "";
        setError(`${result.error}${dupNote}`);
        return;
      }
      if (result.removedDuplicates.length > 0) {
        setNotice(
          `SAME EVENT 중복 ${result.removedDuplicates.length}건을 제외하고 패키지를 생성했습니다.`
        );
      }
      router.push(`/admin/shorts/packages/${result.packageId}`);
    });
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
              setError(null);
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
          disabled={!canGenerate}
          onClick={handleGenerate}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white ${
            canGenerate ? "bg-black hover:bg-gray-800" : "cursor-not-allowed bg-gray-300"
          }`}
        >
          {pending ? "제작 패키지 생성 중…" : "AI 제작 패키지 생성"}
        </button>
      </div>

      {!validation.ok ? (
        <p className="mt-2 text-sm text-amber-700">{validation.message}</p>
      ) : (
        <p className="mt-2 text-sm text-green-700">
          기사 {selectedIds.length}개 선택 완료. 생성 시 서버에서 공개 상태를 다시 확인합니다.
        </p>
      )}

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {notice}
        </div>
      ) : null}

      <div
        className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700"
        role="status"
      >
        <p className="font-semibold text-gray-900">Phase 2 — AI 제작 패키지</p>
        <p className="mt-1">
          Hook·나레이션·자막·화면 구성안·미디어 제안을 생성합니다. 기본은 테스트 생성(OpenAI
          미사용)이며, OpenAI는{" "}
          <code className="text-xs">SHORTS_AI_OPENAI_ENABLED=1</code>일 때만 사용합니다. Preview·
          Production 저장은 <code className="text-xs">SHORTS_PACKAGE_STORE=supabase</code>가
          필요합니다. 자동 공개는 없으며 사람 검토가 필요합니다.
        </p>
      </div>

      {recentPackages.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">최근 제작 패키지</h2>
          <ul className="mt-3 space-y-2">
            {recentPackages.slice(0, 8).map((pkg) => (
              <li key={pkg.id}>
                <Link
                  href={`/admin/shorts/packages/${pkg.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50"
                >
                  <span className="font-medium">{pkg.package.title}</span>
                  <span className="text-gray-500">
                    {deskLabel(pkg.desk)} · {pkg.editDate} ·{" "}
                    {pkg.status === "reviewed" ? "검토 완료" : "초안"} ·{" "}
                    {pkg.generationMode === "openai"
                      ? "AI 생성"
                      : "테스트 생성 · OpenAI 미사용"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
                    disabled={pending}
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
