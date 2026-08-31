import HomeNewsView from "@/components/home/HomeNewsView";
import AnalyticsPageView from "@/components/analytics/AnalyticsPageView";
import { enrichHomeArticlesWithRelativeDates } from "@/lib/home/enrichHomeRelativeDates";
import { fetchEditionHomeArticles } from "@/lib/home/fetchEditionHomeArticles";
import { enHomeLabels } from "@/lib/home/enHomeLabels";
import { prepareEditionHomeSections } from "@/lib/home/prepareEditionHomeSections";
import { enHomeSearchLabels } from "@/lib/home/enSearchLabels";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function EnglishHomePage() {
  const nowMs = Date.now();
  const { articles: rawArticles, error } = await fetchEditionHomeArticles("en");
  const articles = enrichHomeArticlesWithRelativeDates(rawArticles, nowMs);

  const sections = prepareEditionHomeSections(
    articles,
    "en",
    {
      leftTitle: "US & international",
      rightTitle: "Korea",
    },
    { nowMs }
  );

  /** Only outlets that currently have published articles (e.g. hide Yonhap at 0). */
  const sourceOptions = sections.activeSourceLabels;

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-4 py-10 text-neutral-600">
          Loading…
        </main>
      }
    >
      <AnalyticsPageView locale="en" path="/en" />
      <HomeNewsView
        pageRole="en"
        locale="en"
        labels={enHomeLabels}
        sections={sections}
        articleHrefPrefix="/en/article"
        homeHref="/en"
        alternateLangHref="/ko"
        sourceFilterOptions={sourceOptions}
        sourceFilterAllLabel="All outlets"
        errorMessage={error?.message ?? null}
        searchArticles={articles}
        searchPath="/en/search"
        searchLabels={enHomeSearchLabels}
      />
    </Suspense>
  );
}
