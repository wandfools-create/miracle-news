import Link from "next/link";
import {
  formatPublishedDate,
  type ArticleLocale,
} from "@/lib/article/formatPublishedDate";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import { getArticleHref } from "@/lib/home/fetchAllPublishedForMain";
import {
  formatHomeListDate,
  truncateSummary,
} from "@/lib/home/formatHomeListDate";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import type { MainHubSections } from "@/lib/home/prepareMainHubSections";
import type { HomeArticleCard } from "@/lib/home/types";
import NewsThumbnail from "@/components/home/NewsThumbnail";

type MainHubLabels = {
  tagline: string;
  featuredEyebrow: string;
  featuredTitle: string;
  topEyebrow: string;
  topTitle: string;
  topDesc: string;
  recentEyebrow: string;
  recentTitle: string;
  readArticle: string;
  koEdition: string;
  enEdition: string;
  localeKo: string;
  localeEn: string;
  empty: string;
  errorPrefix: string;
  noImage: string;
};

const labels: MainHubLabels = {
  tagline:
    "한국어·영어 검토 기사를 한곳에서 모읍니다. 최근 7일 원문 발행일(published_at) 기준으로 주요 기사를 선정합니다.",
  featuredEyebrow: "Headline",
  featuredTitle: "주요 기사",
  topEyebrow: "Top stories",
  topTitle: "주요 기사 탑 리스트",
  topDesc: "최근 7일 이내 원문 published_at 최신순",
  recentEyebrow: "More",
  recentTitle: "그 외 최신 소식",
  readArticle: "기사 보기",
  koEdition: "한국어 뉴스룸",
  enEdition: "English edition",
  localeKo: "한국어",
  localeEn: "English",
  empty: "현재 공개된 기사가 없습니다.",
  errorPrefix: "데이터를 불러오는 중 오류가 발생했습니다:",
  noImage: "이미지 없음",
};

function LocaleBadge({ locale }: { locale: "ko" | "en" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        locale === "ko"
          ? "bg-news-navy text-white"
          : "border border-neutral-300 bg-white text-neutral-700"
      }`}
    >
      {locale === "ko" ? labels.localeKo : labels.localeEn}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-5 sm:mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
          {description}
        </p>
      ) : null}
    </header>
  );
}

function ArticleThumb({
  article,
  priority = false,
}: {
  article: HomeArticleCard;
  priority?: boolean;
}) {
  return (
    <NewsThumbnail
      article={article}
      noImageLabel={labels.noImage}
      priority={priority}
      useNextImage={false}
    />
  );
}

function displayLocale(article: HomeArticleCard): ArticleLocale {
  return article.locale === "en" ? "en" : "ko";
}

export default function MainHubView({
  sections,
  errorMessage,
}: {
  sections: MainHubSections;
  errorMessage?: string | null;
}) {
  const headerDate = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const hasContent =
    Boolean(sections.featured) ||
    sections.topStories.length > 0 ||
    sections.recentFeed.length > 0;

  return (
    <main className="min-h-screen bg-[#f6f5f2] text-neutral-950">
      <header className="border-b border-neutral-200/90 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
                {headerDate}
              </p>
              <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-neutral-950 sm:text-4xl">
                한눈
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600 sm:text-[15px]">
                {labels.tagline}
              </p>
            </div>

            <nav className="flex flex-wrap gap-2">
              <Link
                href="/ko"
                className="inline-flex min-h-10 items-center rounded-lg border border-news-navy/20 bg-news-navy px-3.5 text-sm font-semibold text-white hover:brightness-110"
              >
                {labels.koEdition}
              </Link>
              <Link
                href="/en"
                className="inline-flex min-h-10 items-center rounded-lg border border-neutral-300 bg-white px-3.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                {labels.enEdition}
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {errorMessage ? (
          <div
            className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {labels.errorPrefix} {errorMessage}
          </div>
        ) : null}

        {!errorMessage && !hasContent ? (
          <p className="rounded-xl border border-neutral-200/90 bg-white py-14 text-center text-neutral-600">
            {labels.empty}
          </p>
        ) : null}

        {!errorMessage && hasContent ? (
          <div className="space-y-10 sm:space-y-12">
            {sections.featured ? (
              <section aria-labelledby="main-featured">
                <SectionHeading
                  eyebrow={labels.featuredEyebrow}
                  title={labels.featuredTitle}
                />
                <article className="overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
                  <Link href={getArticleHref(sections.featured)} className="block">
                    <div className="flex aspect-[16/10] w-full max-h-[min(52vw,420px)] items-center justify-center overflow-hidden bg-white sm:aspect-[2/1] sm:max-h-[440px]">
                      <ArticleThumb article={sections.featured} priority />
                    </div>
                  </Link>
                  <div className="p-5 sm:p-7">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {sections.featured.locale ? (
                        <LocaleBadge locale={sections.featured.locale} />
                      ) : null}
                      <span>{getSourceLabel(sections.featured.source, sections.featured.original_url)}</span>
                      <span>·</span>
                      <span>
                        {getCategoryLabel(
                          sections.featured.category,
                          displayLocale(sections.featured)
                        )}
                      </span>
                      <span>·</span>
                      <time
                        dateTime={
                          sections.featured.published_at ??
                          sections.featured.created_at
                        }
                      >
                        {
                          formatPublishedDate(
                            sections.featured.published_at ??
                              sections.featured.created_at,
                            displayLocale(sections.featured)
                          ).full
                        }
                      </time>
                    </div>
                    <h3 className="mt-3 text-2xl font-bold leading-snug tracking-tight text-neutral-950 sm:text-3xl">
                      <Link
                        href={getArticleHref(sections.featured)}
                        className="hover:text-news-red"
                      >
                        {sections.featured.title}
                      </Link>
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-neutral-600 sm:text-base">
                      {truncateSummary(
                        sections.featured.summary,
                        220,
                        displayLocale(sections.featured)
                      )}
                    </p>
                    <Link
                      href={getArticleHref(sections.featured)}
                      className="mt-5 inline-flex min-h-10 items-center rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                      {labels.readArticle}
                    </Link>
                  </div>
                </article>
              </section>
            ) : null}

            {sections.topStories.length > 0 ? (
              <section aria-labelledby="main-top">
                <SectionHeading
                  eyebrow={labels.topEyebrow}
                  title={labels.topTitle}
                  description={labels.topDesc}
                />
                <ol className="divide-y divide-neutral-200/90 overflow-hidden rounded-xl border border-neutral-200/90 bg-white">
                  {sections.topStories.map((article, index) => {
                    const loc = displayLocale(article);
                    return (
                      <li key={article.id}>
                        <Link
                          href={getArticleHref(article)}
                          className="flex gap-4 p-4 transition hover:bg-neutral-50 sm:gap-5 sm:p-5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
                            {index + 1}
                          </span>
                          <div className="hidden h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white sm:flex sm:h-[4.5rem] sm:w-28">
                            <ArticleThumb article={article} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                              {article.locale ? (
                                <LocaleBadge locale={article.locale} />
                              ) : null}
                              <span>{getSourceLabel(article.source, article.original_url)}</span>
                              <span>·</span>
                              <span>
                                {formatHomeListDate(
                                  article.published_at ?? article.created_at,
                                  loc
                                )}
                              </span>
                            </div>
                            <h3 className="mt-1.5 text-base font-semibold leading-snug text-neutral-950 sm:text-lg">
                              {article.title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-sm text-neutral-600">
                              {truncateSummary(article.summary, 100, loc)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}

            {sections.recentFeed.length > 0 ? (
              <section>
                <SectionHeading
                  eyebrow={labels.recentEyebrow}
                  title={labels.recentTitle}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {sections.recentFeed.map((article) => {
                    const loc = displayLocale(article);
                    return (
                      <Link
                        key={article.id}
                        href={getArticleHref(article)}
                        className="flex gap-3 rounded-xl border border-neutral-200/90 bg-white p-3 transition hover:border-neutral-300 sm:p-4"
                      >
                        <div className="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                          <ArticleThumb article={article} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
                            {article.locale ? (
                              <LocaleBadge locale={article.locale} />
                            ) : null}
                            <span>{getSourceLabel(article.source, article.original_url)}</span>
                          </div>
                          <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-neutral-900">
                            {article.title}
                          </h3>
                          <p className="mt-1 text-[11px] text-neutral-500">
                            {formatHomeListDate(
                              article.published_at ?? article.created_at,
                              loc
                            )}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
