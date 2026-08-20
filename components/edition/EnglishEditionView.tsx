import Link from "next/link";
import {
  CategoryStoryCard,
  CompactStoryCard,
} from "@/components/korean/KoreanStoryCards";
import { getCategoryLabel } from "@/lib/article/categoryLabels";
import type { EditionSections } from "@/lib/home/prepareMainHubSections";

const labels = {
  edition: "Hannoon",
  tagline:
    "Global news at a glance. Headlines and summaries in English from editor-reviewed stories.",
  mainHub: "Hannoon home",
  korean: "한국어",
  latestEyebrow: "Just in",
  latestTitle: "Latest stories",
  categoriesEyebrow: "Sections",
  categoriesTitle: "News by category",
  categoryCount: (n: number) => `${n} stories`,
  empty: "No published English stories yet.",
  errorPrefix: "Could not load articles:",
};

const HREF_PREFIX = "/en/article";

type Props = {
  sections: EditionSections;
  errorMessage?: string | null;
};

export default function EnglishEditionView({ sections, errorMessage }: Props) {
  const hasArticles =
    sections.latestStrip.length > 0 || sections.visibleCategories.length > 0;

  return (
    <main className="min-h-screen bg-[#f6f5f2] text-neutral-950">
      <header className="border-b border-news-navy/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-news-red">
                {labels.edition}
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-news-navy sm:text-3xl">
                English News
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                {labels.tagline}
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              <Link
                href="/en"
                className="inline-flex min-h-10 items-center rounded-lg border border-neutral-300 bg-white px-3.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                {labels.mainHub}
              </Link>
              <Link
                href="/ko"
                className="inline-flex min-h-10 items-center rounded-lg bg-news-navy px-3.5 text-sm font-semibold text-white hover:brightness-110"
              >
                {labels.korean}
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

        {!errorMessage && !hasArticles ? (
          <p className="rounded-xl border border-news-navy/10 bg-white py-14 text-center text-slate-600">
            {labels.empty}
          </p>
        ) : null}

        {!errorMessage && hasArticles ? (
          <div className="space-y-10 sm:space-y-12">
            {sections.latestStrip.length > 0 ? (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {labels.latestEyebrow}
                </p>
                <h2 className="mt-1 text-xl font-bold text-news-navy sm:text-2xl">
                  {labels.latestTitle}
                </h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {sections.latestStrip.map((article) => (
                    <CompactStoryCard
                      key={article.id}
                      article={article}
                      hrefPrefix={HREF_PREFIX}
                      locale="en"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {sections.visibleCategories.length > 0 ? (
              <section id="categories" className="scroll-mt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {labels.categoriesEyebrow}
                </p>
                <h2 className="mt-1 text-xl font-bold text-news-navy sm:text-2xl">
                  {labels.categoriesTitle}
                </h2>

                <div className="mt-8 space-y-12">
                  {sections.visibleCategories.map((category) => {
                    const items = sections.groupedByCategory[category].slice(
                      0,
                      4
                    );
                    const total =
                      sections.groupedByCategory[category].length;

                    return (
                      <div key={category}>
                        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-news-red/80 pb-2">
                          <h3 className="text-lg font-bold text-news-navy">
                            {getCategoryLabel(category, "en")}
                          </h3>
                          <span className="text-sm text-slate-500">
                            {labels.categoryCount(total)}
                          </span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {items.map((article) => (
                            <CategoryStoryCard
                              key={article.id}
                              article={article}
                              hrefPrefix={HREF_PREFIX}
                              locale="en"
                            />
                          ))}
                        </div>
                      </div>
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
