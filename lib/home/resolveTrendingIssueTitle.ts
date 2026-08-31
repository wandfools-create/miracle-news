import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { isMostlyKorean } from "@/lib/article/resolveLocaleContent";
import type { HomeArticleCard } from "./types";

function formatTopicKeyDisplay(topicKey: string): string {
  const trimmed = topicKey.trim();
  if (!trimmed) return "Trending issue";
  return trimmed
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * EN trending issue titles must not show Korean topic_label verbatim.
 * Priority: non-Korean topic_label → EN lead title → topic_key display.
 */
export function resolveTrendingIssueTitle(
  article: HomeArticleCard,
  pageLocale: ArticleLocale,
  topicLabel?: string | null
): string {
  const label = topicLabel?.trim();
  if (pageLocale === "ko") {
    if (label) return label;
    return article.title.trim();
  }

  if (label && !isMostlyKorean(label)) return label;

  const title = article.title?.trim();
  if (title && !isMostlyKorean(title)) return title;

  if (article.topic_key?.trim()) {
    return formatTopicKeyDisplay(article.topic_key);
  }

  if (label) return formatTopicKeyDisplay(label);

  return title || "Trending issue";
}
