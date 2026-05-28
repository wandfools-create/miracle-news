import Link from "next/link";
import type { ReactNode } from "react";
import type { KoreanArticleCard } from "../../lib/koreanPublishedArticles";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { getCategoryLabel as getCategoryLabelI18n } from "@/lib/article/categoryLabels";
import {
  formatDate,
  getCategoryLabel,
  getSourceLabel,
  truncateText,
} from "../../lib/koreanArticleDisplay";

type StoryImageArticle = Pick<
  KoreanArticleCard,
  "thumbnail_url" | "title"
>;

export function StoryImage({
  article,
  priority = false,
  compactPlaceholder = false,
}: {
  article: StoryImageArticle;
  priority?: boolean;
  /** 그리드 셀 등 작은 영역용 */
  compactPlaceholder?: boolean;
}) {
  if (!article.thumbnail_url) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400 ${
          compactPlaceholder ? "text-[10px]" : "text-[13px]"
        }`}
      >
        이미지 없음
      </div>
    );
  }

  return (
    <img
      src={article.thumbnail_url}
      alt={article.title}
      className="h-full w-full rounded-lg object-cover"
      loading={priority ? "eager" : "lazy"}
    />
  );
}

export function StoryMeta({
  article,
  compact = false,
  locale = "ko",
}: {
  article: KoreanArticleCard;
  compact?: boolean;
  locale?: ArticleLocale;
}) {
  const categoryLabel =
    locale === "en"
      ? getCategoryLabelI18n(article.category, "en")
      : getCategoryLabel(article.category);

  return (
    <div
      className={`flex flex-wrap items-center font-medium text-slate-600 ${
        compact
          ? "gap-1.5 text-[10px] leading-4"
          : "gap-2 text-[12px] leading-4"
      }`}
    >
      <span className="text-news-navy/80">
        {getSourceLabel(article.source, article.original_url)}
      </span>
      <span className="text-slate-300">·</span>
      <span>{categoryLabel}</span>
      <span className="text-slate-300">·</span>
      <span className="tabular-nums text-slate-500">
        {formatDate(article.published_at ?? article.created_at)}
      </span>
    </div>
  );
}

export function HeroStoryCard({
  article,
  compact = false,
  hrefPrefix = "/ko/article",
}: {
  article: KoreanArticleCard;
  compact?: boolean;
  hrefPrefix?: string;
}) {
  const articleHref = `${hrefPrefix.replace(/\/$/, "")}/${article.slug}`;
  const summaryLen = compact ? 135 : 180;

  return (
    <article className="overflow-hidden rounded-lg border border-news-navy/10 bg-white transition hover:border-news-navy/18">
      <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
        <Link href={articleHref} className="block bg-slate-100">
          <div
            className={`w-full ${
              compact
                ? "aspect-video max-h-[220px] sm:max-h-none sm:aspect-[16/11] lg:aspect-[16/10]"
                : "aspect-video max-h-[240px] sm:max-h-none sm:aspect-[16/10]"
            }`}
          >
            <StoryImage article={article} priority />
          </div>
        </Link>

        <div
          className={`flex flex-col justify-center border-t border-news-navy/8 lg:border-l lg:border-t-0 ${
            compact ? "p-3 sm:p-5" : "p-4 sm:p-8"
          }`}
        >
          <StoryMeta article={article} compact={compact} />

          <h2
            className={`font-bold leading-snug tracking-tight text-news-navy ${
              compact
                ? "mt-2.5 text-lg sm:mt-3 sm:text-xl md:text-2xl"
                : "mt-3 text-xl sm:mt-4 sm:text-[1.75rem] sm:leading-snug"
            }`}
          >
            <Link href={articleHref} className="hover:text-news-red">
              {article.title}
            </Link>
          </h2>

          <p
            className={`text-slate-600 ${
              compact
                ? "mt-2.5 text-[12px] leading-relaxed sm:mt-3 sm:text-[13px] md:text-sm"
                : "mt-3 text-[14px] leading-relaxed sm:mt-4 sm:text-base"
            }`}
          >
            {truncateText(article.summary, summaryLen)}
          </p>

          <div className={compact ? "mt-3 sm:mt-4" : "mt-5 sm:mt-6"}>
            <Link
              href={articleHref}
              className={`inline-flex items-center justify-center rounded border border-transparent bg-news-red font-semibold text-white transition hover:brightness-95 ${
                compact
                  ? "min-h-10 px-4 text-xs sm:min-h-0 sm:px-3 sm:py-1.5"
                  : "min-h-11 px-5 text-sm sm:min-h-0 sm:px-4 sm:py-2"
              }`}
            >
              기사 보기
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

/** 언론사별 대표 기사 카드용 (한·영 공통 필드) */
export type SourceLeadArticle = Pick<
  KoreanArticleCard,
  | "slug"
  | "title"
  | "summary"
  | "source"
  | "category"
  | "published_at"
  | "created_at"
  | "thumbnail_url"
>;

export function SourceLeadCompactCard({
  sourceLabel,
  sourceDescription,
  article,
  hrefPrefix = "/ko/article",
  variant = "grid",
  meta,
}: {
  sourceLabel: string;
  sourceDescription: string;
  article: SourceLeadArticle;
  hrefPrefix?: string;
  variant?: "row" | "grid";
  meta?: ReactNode;
}) {
  const base = hrefPrefix.replace(/\/$/, "");
  const href = `${base}/${article.slug}`;
  const metaBlock =
    meta ??
    (
      <StoryMeta
        article={article as KoreanArticleCard}
        compact={variant === "grid"}
      />
    );

  if (variant === "grid") {
    return (
      <article className="flex h-full flex-col overflow-hidden rounded-lg border border-news-navy/10 bg-white p-2.5 transition hover:border-news-navy/18 active:bg-slate-50/80 sm:p-3">
        <Link
          href={href}
          className="block shrink-0 overflow-hidden rounded-md bg-slate-100"
        >
          <div className="aspect-[5/3] w-full min-h-[64px] max-h-[80px] sm:min-h-[68px] sm:max-h-[96px]">
            <StoryImage
              article={article}
              compactPlaceholder
            />
          </div>
        </Link>
        <div className="mt-2 flex min-h-0 flex-1 flex-col">
          <span
            className="inline-flex w-fit max-w-full truncate rounded border border-news-navy/10 bg-news-navy px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white"
            title={sourceDescription}
          >
            {sourceLabel}
          </span>
          <div className="mt-1.5 min-w-0">{metaBlock}</div>
          <h3 className="mt-1 text-[12px] font-bold leading-snug text-news-navy sm:text-[13px]">
            <Link href={href} className="line-clamp-3 hover:text-news-red">
              {article.title}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-600 sm:text-[11px]">
            {truncateText(article.summary, 62)}
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-lg border border-news-navy/10 bg-white p-4 transition hover:border-news-navy/18">
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-start">
        <Link href={href} className="block overflow-hidden rounded-lg bg-slate-100">
          <div className="aspect-[4/3] w-full">
            <StoryImage article={article} />
          </div>
        </Link>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-news-navy/10 bg-news-navy px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
              {sourceLabel}
            </span>
            <span className="text-[12px] text-slate-500">{sourceDescription}</span>
          </div>

          <div className="mt-3">{metaBlock}</div>

          <h3 className="mt-2 text-[17px] font-bold leading-snug text-news-navy">
            <Link href={href} className="hover:text-news-red">
              {article.title}
            </Link>
          </h3>

          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
            {truncateText(article.summary, 90)}
          </p>
        </div>
      </div>
    </article>
  );
}

export function CompactStoryCard({
  article,
  hrefPrefix = "/ko/article",
  locale = "ko",
}: {
  article: KoreanArticleCard;
  hrefPrefix?: string;
  locale?: ArticleLocale;
}) {
  const articleHref = `${hrefPrefix.replace(/\/$/, "")}/${article.slug}`;
  return (
    <article className="rounded-lg border border-news-navy/10 bg-white p-3 transition hover:border-news-navy/18 active:bg-slate-50/50 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4 sm:items-start">
        <Link
          href={articleHref}
          className="block overflow-hidden rounded-lg bg-slate-100"
        >
          <div className="aspect-video w-full max-h-[200px] sm:aspect-[4/3] sm:max-h-none">
            <StoryImage article={article} />
          </div>
        </Link>

        <div className="min-w-0">
          <StoryMeta article={article} locale={locale} />

          <h3 className="mt-2 text-[15px] font-semibold leading-snug text-news-navy sm:text-[17px]">
            <Link
              href={articleHref}
              className="block py-0.5 hover:text-news-red sm:py-0"
            >
              {article.title}
            </Link>
          </h3>

          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 sm:mt-2 sm:text-[14px]">
            {truncateText(article.summary, 110)}
          </p>
        </div>
      </div>
    </article>
  );
}

export function SidebarTopStoryItem({
  article,
  index,
  hrefPrefix = "/ko/article",
}: {
  article: KoreanArticleCard;
  index: number;
  hrefPrefix?: string;
}) {
  const articleHref = `${hrefPrefix.replace(/\/$/, "")}/${article.slug}`;
  return (
    <article className="border-b border-news-navy/8 pb-3 last:border-b-0 last:pb-0 sm:pb-4">
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-news-navy text-[11px] font-bold text-white sm:h-7 sm:w-7">
          {index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-news-red">
            {getSourceLabel(article.source, article.original_url)}
          </div>

          <h3 className="mt-1 text-[13px] font-semibold leading-snug text-news-navy">
            <Link href={articleHref} className="hover:text-news-red">
              {article.title}
            </Link>
          </h3>

          <p className="mt-1 text-[11px] tabular-nums leading-4 text-slate-500">
            {formatDate(article.published_at ?? article.created_at)}
          </p>
        </div>
      </div>
    </article>
  );
}

export function CategoryStoryCard({
  article,
  hrefPrefix = "/ko/article",
  locale = "ko",
}: {
  article: KoreanArticleCard;
  hrefPrefix?: string;
  locale?: ArticleLocale;
}) {
  const articleHref = `${hrefPrefix.replace(/\/$/, "")}/${article.slug}`;
  return (
    <article className="overflow-hidden rounded-lg border border-news-navy/10 bg-white transition hover:border-news-navy/18">
      <Link href={articleHref} className="block bg-slate-100">
        <div className="aspect-[16/9] w-full">
          <StoryImage article={article} />
        </div>
      </Link>

      <div className="p-4 sm:p-5">
        <StoryMeta article={article} locale={locale} />

        <h3 className="mt-2 text-lg font-semibold leading-snug text-news-navy sm:text-xl">
          <Link
            href={articleHref}
            className="block py-0.5 hover:text-news-red sm:py-0"
          >
            {article.title}
          </Link>
        </h3>

        <p className="mt-2 text-[13px] leading-relaxed text-slate-600 sm:text-[14px]">
          {truncateText(article.summary, 130)}
        </p>
      </div>
    </article>
  );
}
