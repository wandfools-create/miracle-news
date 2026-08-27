import Link from "next/link";
import { getSourceLabel } from "@/lib/koreanArticleDisplay";
import type {
  TrendingIssue,
  TrendingIssueRelatedArticle,
  TrendingIssuesBlock,
} from "@/lib/home/types";

export type TrendingIssuesLabels = {
  title: string;
  regionUs: string;
  regionKr: string;
  relatedArticlesLabel: string;
  originalSourceLabel: string;
};

type TrendingIssuesPanelProps = {
  block: TrendingIssuesBlock;
  labels: TrendingIssuesLabels;
  /** Locale article prefix, e.g. `/ko/article` or `/en/article`. */
  articleHrefPrefix: string;
};

function articleHref(
  article: TrendingIssueRelatedArticle,
  articleHrefPrefix: string
): string {
  return `${articleHrefPrefix.replace(/\/$/, "")}/${article.slug}`;
}

function IssueRow({
  issue,
  labels,
  articleHrefPrefix,
}: {
  issue: TrendingIssue;
  labels: TrendingIssuesLabels;
  articleHrefPrefix: string;
}) {
  const primary = issue.primaryArticle;
  const related = issue.relatedArticles;
  const primaryHref = primary
    ? articleHref(primary, articleHrefPrefix)
    : null;

  return (
    <li className="border-b border-neutral-200/80 py-2.5 last:border-b-0 last:pb-0">
      {primaryHref ? (
        <Link
          href={primaryHref}
          className="group block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-news-navy"
        >
          <p className="text-[13px] font-semibold leading-snug text-neutral-950 group-hover:underline decoration-neutral-300 underline-offset-2">
            {issue.title}
          </p>
          {issue.description ? (
            <p className="mt-1 text-xs leading-relaxed text-neutral-600 group-hover:text-neutral-700">
              {issue.description}
            </p>
          ) : null}
        </Link>
      ) : (
        <>
          <p className="text-[13px] font-semibold leading-snug text-neutral-950">
            {issue.title}
          </p>
          {issue.description ? (
            <p className="mt-1 text-xs leading-relaxed text-neutral-600">
              {issue.description}
            </p>
          ) : null}
        </>
      )}

      {related.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            {labels.relatedArticlesLabel}
          </p>
          <ul className="space-y-1">
            {related.map((article) => {
              const href = articleHref(article, articleHrefPrefix);
              const sourceLabel = getSourceLabel(
                article.source,
                article.original_url
              );
              return (
                <li key={article.id} className="min-w-0">
                  <Link
                    href={href}
                    className="block rounded-sm text-[11px] leading-snug text-neutral-700 hover:text-news-navy hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-news-navy"
                  >
                    <span className="font-medium text-neutral-500">
                      {sourceLabel}
                    </span>
                    <span className="mx-1 text-neutral-300">·</span>
                    <span className="line-clamp-1">{article.title}</span>
                  </Link>
                  {article.original_url ? (
                    <a
                      href={article.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-block text-[10px] text-neutral-400 hover:text-neutral-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-news-navy"
                    >
                      {labels.originalSourceLabel}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function RegionList({
  title,
  issues,
  accentClass,
  labels,
  articleHrefPrefix,
}: {
  title: string;
  issues: TrendingIssue[];
  accentClass: string;
  labels: TrendingIssuesLabels;
  articleHrefPrefix: string;
}) {
  if (issues.length === 0) return null;

  return (
    <div className="mt-3 first:mt-0">
      <p
        className={`border-l-2 pl-2 text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500 ${accentClass} border-solid`}
      >
        {title}
      </p>
      <ul className="mt-2 space-y-0">
        {issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            labels={labels}
            articleHrefPrefix={articleHrefPrefix}
          />
        ))}
      </ul>
    </div>
  );
}

export default function TrendingIssuesPanel({
  block,
  labels,
  articleHrefPrefix,
}: TrendingIssuesPanelProps) {
  return (
    <section
      className="rounded-lg border border-neutral-200 bg-white px-4 py-3.5 shadow-sm"
      aria-labelledby="trending-issues-heading"
    >
      <h2
        id="trending-issues-heading"
        className="text-sm font-bold text-news-navy"
      >
        {labels.title}
      </h2>
      <RegionList
        title={labels.regionUs}
        issues={block.us}
        accentClass="border-l-blue-800"
        labels={labels}
        articleHrefPrefix={articleHrefPrefix}
      />
      <RegionList
        title={labels.regionKr}
        issues={block.kr}
        accentClass="border-l-news-red"
        labels={labels}
        articleHrefPrefix={articleHrefPrefix}
      />
    </section>
  );
}
