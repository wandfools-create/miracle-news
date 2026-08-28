import { formatHomeRelativeTime } from "./homeRelativeTime";
import type { HomeArticleCard } from "./types";

export function enrichHomeArticlesWithRelativeDates(
  articles: HomeArticleCard[],
  nowMs: number = Date.now()
): HomeArticleCard[] {
  return articles.map((article) => ({
    ...article,
    listDateKo: formatHomeRelativeTime(article.published_at, "ko", nowMs),
    listDateEn: formatHomeRelativeTime(article.published_at, "en", nowMs),
  }));
}
