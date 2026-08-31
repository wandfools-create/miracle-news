export const ANALYTICS_EVENT_ALLOWLIST = [
  "page_view",
  "article_view",
  "article_click",
  "source_filter_click",
  "category_filter_click",
  "related_article_click",
  "language_switch",
  "search_submit",
  "search_result_click",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_ALLOWLIST)[number];

export type AnalyticsEventPayload = {
  eventName: AnalyticsEventName;
  sessionId: string;
  locale?: string | null;
  path?: string | null;
  articleId?: string | null;
  sourceKey?: string | null;
  categoryKey?: string | null;
  searchQuery?: string | null;
  referrerDomain?: string | null;
  deviceClass?: "mobile" | "desktop" | null;
};

export function sanitizeSearchQuery(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || null;
}

export function hashSearchQuery(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i += 1) {
    hash = (hash * 31 + query.charCodeAt(i)) | 0;
  }
  return `q${Math.abs(hash)}`;
}

export function sanitizeReferrerDomain(
  referrer: string | null | undefined
): string | null {
  if (!referrer?.trim()) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.slice(0, 120) || null;
  } catch {
    return null;
  }
}

export function isAllowedAnalyticsEvent(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENT_ALLOWLIST as readonly string[]).includes(name);
}

export function createAnonymousSessionId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
