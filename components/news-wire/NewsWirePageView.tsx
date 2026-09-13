import Link from "next/link";

import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import type { NewsWireItem } from "@/lib/news-wire/types";

function formatWireDateTime(iso: string | null, locale: ArticleLocale): string {
  if (!iso) return locale === "ko" ? "시각 미상" : "Time unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return locale === "ko" ? "시각 미상" : "Time unknown";
  }
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(utc));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export default function NewsWirePageView({
  locale,
  title,
  homeHref,
  homeLabel,
  items,
  dateKey,
  page,
  hasMore,
  schemaReady,
  error,
}: {
  locale: ArticleLocale;
  title: string;
  homeHref: string;
  homeLabel: string;
  items: NewsWireItem[];
  dateKey: string;
  page: number;
  hasMore: boolean;
  schemaReady: boolean;
  error: string | null;
}) {
  const base = locale === "ko" ? "/ko/wire" : "/en/wire";
  const prevDate = shiftDateKey(dateKey, -1);
  const nextDate = shiftDateKey(dateKey, 1);
  const emptyLabel =
    locale === "ko"
      ? "이 날짜에 표시할 수집 뉴스가 없습니다."
      : "No News Wire items for this date.";

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold text-neutral-500">
          <Link href={homeHref} className="hover:underline">
            {homeLabel}
          </Link>
          {" / "}
          {title}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {locale === "ko"
            ? "수집된 후보 헤드라인입니다. 제목을 누르면 원문 사이트로 이동합니다."
            : "Collected headlines. Titles open the original publisher site."}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`${base}?date=${prevDate}`}
            className="rounded-lg border px-3 py-1.5 hover:bg-neutral-50"
          >
            {locale === "ko" ? "← 이전 날짜" : "← Previous day"}
          </Link>
          <span className="font-semibold">{dateKey}</span>
          <Link
            href={`${base}?date=${nextDate}`}
            className="rounded-lg border px-3 py-1.5 hover:bg-neutral-50"
          >
            {locale === "ko" ? "다음 날짜 →" : "Next day →"}
          </Link>
        </div>

        {!schemaReady ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            {locale === "ko"
              ? "수집 뉴스 준비가 아직 완료되지 않았습니다."
              : "News Wire is not ready yet."}
          </p>
        ) : null}
        {error ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            {locale === "ko" ? "목록을 불러오지 못했습니다." : "Could not load the list."}
          </p>
        ) : null}

        {schemaReady && !error && items.length === 0 ? (
          <p className="mt-8 text-sm text-neutral-600">{emptyLabel}</p>
        ) : null}

        <ul className="mt-6 divide-y divide-neutral-100">
          {items.map((item) => (
            <li key={item.id} className="py-4">
              <a
                href={item.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-semibold leading-snug text-neutral-900 hover:underline"
              >
                {item.title}
              </a>
              <p className="mt-1 text-sm text-neutral-500">
                {item.sourceLabel}
                <span className="mx-1.5 text-neutral-300">·</span>
                {formatWireDateTime(
                  item.publishedAt || item.collectedAt,
                  locale
                )}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`${base}?date=${dateKey}&page=${page - 1}`}
              className="rounded-lg border px-3 py-1.5 hover:bg-neutral-50"
            >
              {locale === "ko" ? "이전 페이지" : "Previous page"}
            </Link>
          ) : null}
          {hasMore ? (
            <Link
              href={`${base}?date=${dateKey}&page=${page + 1}`}
              className="rounded-lg border px-3 py-1.5 hover:bg-neutral-50"
            >
              {locale === "ko" ? "다음 페이지" : "Next page"}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
