import type { HomeArticleCard } from "./types";

const SOCIAL_HOST_RE =
  /(?:^|\.)(youtube\.com|youtu\.be|instagram\.com|twitter\.com|x\.com)(?:\/|$)/i;

const SOCIAL_SOURCE_RE =
  /youtube|youtu\.be|instagram|twitter|\bx\b|tiktok|facebook/i;

/** YouTube / X / Instagram 등 링크 기반 기사. */
export function isSocialMediaArticle(article: HomeArticleCard): boolean {
  const source = article.source?.trim() ?? "";
  if (source && SOCIAL_SOURCE_RE.test(source)) return true;

  const url = article.original_url?.trim();
  if (url) {
    try {
      const host = new URL(
        url.startsWith("http") ? url : `https://${url}`
      ).hostname.toLowerCase();
      if (SOCIAL_HOST_RE.test(host)) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

export function socialPlatformLabel(article: HomeArticleCard): string {
  const hay = `${article.source ?? ""} ${article.original_url ?? ""}`.toLowerCase();
  if (hay.includes("youtube") || hay.includes("youtu.be")) return "YouTube";
  if (hay.includes("instagram")) return "Instagram";
  if (hay.includes("twitter") || hay.includes("x.com") || /\bx\b/.test(hay))
    return "X";
  if (hay.includes("tiktok")) return "TikTok";
  return "SNS";
}
