import HomeNewsView from "@/components/home/HomeNewsView";
import { enrichHomeArticlesWithRelativeDates } from "@/lib/home/enrichHomeRelativeDates";
import { fetchEditionHomeArticles } from "@/lib/home/fetchEditionHomeArticles";
import { koHomeLabels } from "@/lib/home/koHomeLabels";
import { prepareEditionHomeSections } from "@/lib/home/prepareEditionHomeSections";
import { koHomeSearchLabels } from "@/lib/home/koSearchLabels";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function KoreanHomePage() {
  const nowMs = Date.now();
  const { articles: rawArticles, error } = await fetchEditionHomeArticles("ko");
  const articles = enrichHomeArticlesWithRelativeDates(rawArticles, nowMs);

  const sections = prepareEditionHomeSections(
    articles,
    "ko",
    {
      leftTitle: "한국 기사",
      rightTitle: "영어 · 미국 기사",
    },
    { nowMs }
  );

  /** Only outlets that currently have published articles (e.g. hide Yonhap at 0). */
  const sourceOptions = sections.activeSourceLabels;

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-4 py-10 text-neutral-600">
          불러오는 중…
        </main>
      }
    >
      <HomeNewsView
        pageRole="ko"
        locale="ko"
        labels={koHomeLabels}
        sections={sections}
        articleHrefPrefix="/ko/article"
        homeHref="/ko"
        alternateLangHref="/en"
        sourceFilterOptions={sourceOptions}
        sourceFilterAllLabel="모든 언론사"
        errorMessage={error?.message ?? null}
        searchArticles={articles}
        searchPath="/ko/search"
        searchLabels={koHomeSearchLabels}
      />
    </Suspense>
  );
}
