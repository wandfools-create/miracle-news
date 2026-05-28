import type { LinkType } from "./types";

export function detectLinkType(url: URL): LinkType {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  const path = url.pathname.toLowerCase();
  const href = url.href.toLowerCase();

  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    return "youtube";
  }
  if (host === "twitter.com" || host === "x.com" || host === "mobile.twitter.com") {
    return "x";
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return "instagram";
  }
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(path) || /\.(mp4|webm|mov)(\?|#|$)/i.test(href)) {
    return "video";
  }

  return "article";
}

export function linkTypeLabel(type: LinkType): string {
  const map: Record<LinkType, string> = {
    article: "기사/웹",
    youtube: "YouTube",
    x: "X(트위터)",
    instagram: "Instagram",
    video: "직접 영상 링크",
  };
  return map[type];
}
