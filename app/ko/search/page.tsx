import NewsSearchResultsView from "@/components/home/NewsSearchResultsView";
import { filterArticlesForSearch } from "@/lib/home/articleSearch";
import { fetchEditionHomeArticles } from "@/lib/home/fetchEditionHomeArticles";
import { koSearchResultsLabels } from "@/lib/home/koSearchLabels";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function KoreanSearchPage({ searchParams }: PageProps) {
  const { q = "" } = await searchParams;
  const { articles } = await fetchEditionHomeArticles("ko");
  const results = filterArticlesForSearch(articles, q, "ko");

  return (
    <NewsSearchResultsView
      locale="ko"
      query={q}
      results={results}
      labels={koSearchResultsLabels}
      homeHref="/ko"
      alternateLangHref="/en"
      articleHrefPrefix="/ko/article"
      searchPath="/ko/search"
    />
  );
}
