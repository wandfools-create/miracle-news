import { absoluteUrl } from "@/lib/seo/site";
import type { ShortsPublishedArticleRow } from "@/lib/shorts/fetchPublishedArticlesForShorts";
import type {
  ShortsArticleMediaSuggestion,
  ShortsProductionPackageContent,
  ShortsSourceArticleRef,
} from "@/lib/shorts/shortsPackageTypes";

export function hannoonPublicTitle(article: ShortsPublishedArticleRow): string {
  return (
    article.ko_localization_title?.trim() ||
    article.title_ko?.trim() ||
    article.title_original?.trim() ||
    "제목 없음"
  );
}

export function hannoonPublicUrl(article: ShortsPublishedArticleRow): string | null {
  const slug = article.ko_slug?.trim();
  if (!slug) return null;
  return absoluteUrl(`/ko/article/${encodeURIComponent(slug)}`);
}

export function originalSourceUrl(article: ShortsPublishedArticleRow): string | null {
  return article.original_url?.trim() || article.canonical_url?.trim() || null;
}

/** Build source refs only from server-loaded article rows (never client URLs). */
export function buildShortsSourceArticles(
  articles: ShortsPublishedArticleRow[]
): ShortsSourceArticleRef[] {
  return articles.map((article) => ({
    articleId: article.id,
    title: hannoonPublicTitle(article),
    hannoonUrl: hannoonPublicUrl(article),
    sourceDisplayName: article.source?.trim() || null,
    originalUrl: originalSourceUrl(article),
  }));
}

export function buildShortsMediaSuggestions(
  articles: ShortsPublishedArticleRow[],
  existing?: ShortsArticleMediaSuggestion[]
): ShortsArticleMediaSuggestion[] {
  return articles.map((article) => {
    const prior = existing?.find((item) => item.articleId === article.id);
    return {
      articleId: article.id,
      title: hannoonPublicTitle(article),
      url: hannoonPublicUrl(article),
      imageSuggestion:
        prior?.imageSuggestion?.trim() ||
        (article.thumbnail_url?.trim()
          ? "기사 썸네일을 메인 비주얼로 사용"
          : "출처 로고 + 헤드라인 텍스트 카드"),
      videoSuggestion:
        prior?.videoSuggestion?.trim() ||
        "관련 B-roll 또는 정적 이미지 슬라이드",
    };
  });
}

/** Overwrite AI/client source links with server-authoritative article data. */
export function attachServerBuiltSources(
  packageContent: ShortsProductionPackageContent,
  articles: ShortsPublishedArticleRow[]
): ShortsProductionPackageContent {
  return {
    ...packageContent,
    sourceArticles: buildShortsSourceArticles(articles),
    articleMediaSuggestions: buildShortsMediaSuggestions(
      articles,
      packageContent.articleMediaSuggestions
    ),
  };
}
