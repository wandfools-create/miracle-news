"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";

export type EditionFilterBarLabels = {
  filterEyebrow: string;
  filterAll: string;
  filterSources: string;
  filterCategories: string;
};

type EditionFilterBarProps = {
  locale: ArticleLocale;
  labels: EditionFilterBarLabels;
  sources: Array<{ key: string; label: string }>;
  categories: string[];
  activeSource?: string | null;
  activeCategory?: string | null;
};

function buildFilterHref(
  pathname: string,
  next: { source?: string | null; category?: string | null }
) {
  const params = new URLSearchParams();
  if (next.source) params.set("source", next.source);
  if (next.category) params.set("category", next.category);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
        active
          ? "bg-news-navy text-white"
          : "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
      }`}
    >
      {children}
    </Link>
  );
}

export default function EditionFilterBar({
  locale,
  labels,
  sources,
  categories,
  activeSource,
  activeCategory,
}: EditionFilterBarProps) {
  const pathname = usePathname();
  const showAll = !activeSource && !activeCategory;

  return (
    <section
      aria-label={labels.filterEyebrow}
      className="rounded-lg border border-neutral-200 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-news-red">
        {labels.filterEyebrow}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FilterChip href={buildFilterHref(pathname, {})} active={showAll}>
          {labels.filterAll}
        </FilterChip>
      </div>

      {sources.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {labels.filterSources}
          </p>
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <FilterChip
                key={source.key}
                href={buildFilterHref(pathname, {
                  source: source.key,
                  category: activeCategory,
                })}
                active={activeSource === source.key}
              >
                {source.label}
              </FilterChip>
            ))}
          </div>
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {labels.filterCategories}
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <FilterChip
                key={category}
                href={buildFilterHref(pathname, {
                  source: activeSource,
                  category,
                })}
                active={activeCategory === category}
              >
                {getCategoryLabel(category, locale)}
              </FilterChip>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
