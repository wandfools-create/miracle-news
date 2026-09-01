import NewsSearchResultsView from "@/components/home/NewsSearchResultsView";
import AnalyticsPageView from "@/components/analytics/AnalyticsPageView";
import { filterArticlesForSearch } from "@/lib/home/articleSearch";
import { fetchEditionHomeArticles } from "@/lib/home/fetchEditionHomeArticles";
import { enSearchResultsLabels } from "@/lib/home/enSearchLabels";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function EnglishSearchPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const { articles } = await fetchEditionHomeArticles("en");
  const results = filterArticlesForSearch(articles, q, "en");

  return (
    <>
      <AnalyticsPageView locale="en" path="/en/search" />
      <NewsSearchResultsView
      locale="en"
      query={q}
      results={results}
      labels={enSearchResultsLabels}
      homeHref="/en"
      alternateLangHref="/ko"
      articleHrefPrefix="/en/article"
      searchPath="/en/search"
    />
    </>
  );
}
