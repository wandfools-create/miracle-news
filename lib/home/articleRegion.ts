import {
  getArticleRegionFromSignals,
  isSourceKeyForRegion,
  type ArticleRegion,
} from "@/lib/article/sourceRegion";
import type { HomeArticleCard } from "./types";

export type { ArticleRegion };

export { isSourceKeyForRegion };

/** Classify for edition home US / Korea columns (source & URL first, not locale). */
export function getArticleRegion(article: HomeArticleCard): ArticleRegion {
  return getArticleRegionFromSignals({
    source: article.source,
    original_url: article.original_url,
    source_country: article.source_country,
    title: article.title,
    title_original: article.title_original,
  });
}
