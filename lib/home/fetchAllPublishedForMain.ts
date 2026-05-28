import { fetchEnglishPublishedArticles } from "@/lib/englishPublishedArticles";
import { fetchKoreanPublishedArticles } from "@/lib/koreanPublishedArticles";
import type { HomeArticleCard } from "./types";

export async function fetchAllPublishedForMainHub(): Promise<{
  articles: HomeArticleCard[];
  error: { message: string } | null;
}> {
  const [koResult, enResult] = await Promise.all([
    fetchKoreanPublishedArticles(),
    fetchEnglishPublishedArticles(),
  ]);

  const articles: HomeArticleCard[] = [
    ...koResult.articles.map((a) => ({ ...a, locale: "ko" as const })),
    ...enResult.articles.map((a) => ({ ...a, locale: "en" as const })),
  ];

  const error = koResult.error ?? enResult.error ?? null;

  return { articles, error };
}

export function getArticleHref(article: HomeArticleCard): string {
  const locale = article.locale ?? "ko";
  return `/${locale}/article/${article.slug}`;
}
