import type { ArticleEditionLocale, HomeArticleCard } from "./types";

const LOCALE_ARTICLE_PREFIX: Record<ArticleEditionLocale, string> = {
  ko: "/ko/article",
  en: "/en/article",
};

export function resolveArticleHref(
  article: HomeArticleCard,
  articleHrefPrefix: string,
  articleHrefFor?: (article: HomeArticleCard) => string
): string {
  if (articleHrefFor) return articleHrefFor(article);
  const prefix =
    article.locale != null
      ? LOCALE_ARTICLE_PREFIX[article.locale]
      : articleHrefPrefix.replace(/\/$/, "");
  return `${prefix}/${article.slug}`;
}
