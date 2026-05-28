import type { HomeArticleCard } from "./types";

export function resolveArticleHref(
  article: HomeArticleCard,
  articleHrefPrefix: string,
  articleHrefFor?: (article: HomeArticleCard) => string
): string {
  if (articleHrefFor) return articleHrefFor(article);
  return `${articleHrefPrefix.replace(/\/$/, "")}/${article.slug}`;
}
