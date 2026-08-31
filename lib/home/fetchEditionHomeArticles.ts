import {
  buildEditionHomeCard,
  type EditionHomeMergeEntry,
} from "./buildEditionHomeCard";
import { enrichHomeArticlesWithCandidateGrades } from "./enrichHomeArticlesWithCandidateGrades";
import { fetchEditionHomeArticlePool } from "./fetchEditionHomeArticlePool";
import type { ArticleEditionLocale, HomeArticleCard } from "./types";

/** Merged KO+EN published pool with copy resolved for the edition page locale. */
export async function fetchEditionHomeArticles(
  displayLocale: ArticleEditionLocale
): Promise<{
  articles: HomeArticleCard[];
  error: { message: string } | null;
}> {
  const { articleIds, entries, error } = await fetchEditionHomeArticlePool({
    includeBody: false,
  });

  const articles: HomeArticleCard[] = [];
  for (const articleId of articleIds) {
    const entry = entries.get(articleId);
    if (!entry) continue;
    const card = buildEditionHomeCard(displayLocale, entry);
    if (card) articles.push(card);
  }

  const enriched = await enrichHomeArticlesWithCandidateGrades(articles);

  return {
    articles: enriched,
    error,
  };
}

export type { EditionHomeMergeEntry };
