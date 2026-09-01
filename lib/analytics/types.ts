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

export type AnalyticsLocale = "ko" | "en";

export type AnalyticsDeviceClass = "mobile" | "desktop";

export type AnalyticsEventPayload = {
  eventName: AnalyticsEventName;
  sessionId: string;
  locale?: AnalyticsLocale | null;
  path?: string | null;
  articleId?: string | null;
  sourceKey?: string | null;
  categoryKey?: string | null;
  searchQuery?: string | null;
  referrerDomain?: string | null;
  deviceClass?: AnalyticsDeviceClass | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

const ALLOWED_PATH_PREFIXES = ["/ko", "/en"] as const;

export const ANALYTICS_MAX_BODY_BYTES = 2048;
export const ANALYTICS_MAX_SEARCH_QUERY_LENGTH = 80;
export const ANALYTICS_MAX_PATH_LENGTH = 500;
export const ANALYTICS_MAX_KEY_LENGTH = 80;
export const ANALYTICS_MAX_SESSION_ID_LENGTH = 64;
export const ANALYTICS_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const INTERNAL_SITE_ROOTS = ["hannoon.co"] as const;

export type StoredAnonymousSession = {
  id: string;
  createdAt: number;
};

export function isAllowedAnalyticsEvent(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENT_ALLOWLIST as readonly string[]).includes(name);
}

export function isAnalyticsLocale(value: string | null | undefined): value is AnalyticsLocale {
  return value === "ko" || value === "en";
}

export function isValidUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

export function isAdminAnalyticsPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path === "/admin" || path.startsWith("/admin/");
}

export function sanitizeAnalyticsPath(path: string | null | undefined): string | null {
  const trimmed = (path ?? "").trim();
  if (!trimmed || trimmed.length > ANALYTICS_MAX_PATH_LENGTH) return null;
  if (!trimmed.startsWith("/")) return null;
  if (isAdminAnalyticsPath(trimmed)) return null;
  const allowed = ALLOWED_PATH_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}/`)
  );
  return allowed ? trimmed : null;
}

export function sanitizeAnalyticsKey(
  value: string | null | undefined,
  maxLength = ANALYTICS_MAX_KEY_LENGTH
): string | null {
  const cleaned = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

export function maskPiiInSearchQuery(query: string): string {
  return query.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
}

export function sanitizeSearchQuery(raw: string | null | undefined): string | null {
  const withoutControl = (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
  const masked = maskPiiInSearchQuery(withoutControl);
  const normalized = masked.trim().replace(/\s+/g, " ");
  const limited = normalized.slice(0, ANALYTICS_MAX_SEARCH_QUERY_LENGTH);
  return limited || null;
}

export function normalizeSearchQueryForDisplay(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeAnalyticsHost(host: string | null | undefined): string | null {
  if (!host?.trim()) return null;
  const withoutPort = host.trim().toLowerCase().split(":")[0] ?? "";
  const normalized = withoutPort.replace(/^www\./, "");
  return normalized || null;
}

export function isSameAnalyticsSite(
  hostA: string | null | undefined,
  hostB: string | null | undefined
): boolean {
  const a = normalizeAnalyticsHost(hostA);
  const b = normalizeAnalyticsHost(hostB);
  if (!a || !b) return false;
  if (a === b) return true;

  for (const root of INTERNAL_SITE_ROOTS) {
    const matchesRoot = (host: string) => host === root || host.endsWith(`.${root}`);
    if (matchesRoot(a) && matchesRoot(b)) return true;
  }

  return false;
}

export function extractReferrerHostname(
  referrer: string | null | undefined
): string | null {
  if (!referrer?.trim()) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host.slice(0, 120) || null;
  } catch {
    const trimmed = referrer.trim().toLowerCase();
    if (!trimmed || trimmed.includes("/") || trimmed.includes(" ")) return null;
    return trimmed.slice(0, 120) || null;
  }
}

export function sanitizeReferrerDomain(
  referrer: string | null | undefined
): string | null {
  return extractReferrerHostname(referrer);
}

export function resolveExternalReferrerDomain(
  referrer: string | null | undefined,
  currentHost: string | null | undefined
): string | null {
  const referrerHost = extractReferrerHostname(referrer);
  if (!referrerHost) return null;
  if (isSameAnalyticsSite(referrerHost, currentHost)) return null;
  return referrerHost;
}

export function shouldStoreReferrerForEvent(eventName: AnalyticsEventName): boolean {
  return eventName === "page_view" || eventName === "article_view";
}

export function resolveStoredReferrerDomain(
  eventName: AnalyticsEventName,
  referrer: string | null | undefined,
  currentHost: string | null | undefined
): string | null {
  if (!shouldStoreReferrerForEvent(eventName)) return null;
  return resolveExternalReferrerDomain(referrer, currentHost);
}

export function sanitizeSessionId(sessionId: string | null | undefined): string | null {
  const cleaned = (sessionId ?? "").trim().slice(0, ANALYTICS_MAX_SESSION_ID_LENGTH);
  if (!cleaned || !/^[a-zA-Z0-9_-]+$/.test(cleaned)) return null;
  return cleaned;
}

export function sanitizeDeviceClass(
  value: string | null | undefined
): AnalyticsDeviceClass | null {
  if (value === "mobile" || value === "desktop") return value;
  return null;
}

export function buildAnalyticsDedupeKey(parts: {
  sessionId: string;
  eventName: AnalyticsEventName;
  articleId?: string | null;
  path?: string | null;
  sourceKey?: string | null;
  categoryKey?: string | null;
  searchQuery?: string | null;
  minuteBucket?: number;
}): string {
  const bucket =
    parts.minuteBucket ?? Math.floor(Date.now() / 60_000);
  const pathPart =
    parts.eventName === "search_submit" ? "" : (parts.path ?? "");
  return [
    parts.sessionId,
    parts.eventName,
    parts.articleId ?? "",
    pathPart,
    parts.sourceKey ?? "",
    parts.categoryKey ?? "",
    parts.searchQuery ?? "",
    String(bucket),
  ].join("|");
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

export function parseStoredAnonymousSession(
  raw: string | null | undefined
): StoredAnonymousSession | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; createdAt?: unknown };
    const id = typeof parsed.id === "string" ? sanitizeSessionId(parsed.id) : null;
    const createdAt =
      typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : null;
    if (!id || createdAt === null) return null;
    return { id, createdAt };
  } catch {
    const legacyId = sanitizeSessionId(raw);
    if (!legacyId) return null;
    return { id: legacyId, createdAt: 0 };
  }
}

export function resolveAnonymousSession(
  stored: StoredAnonymousSession | null,
  nowMs: number = Date.now()
): StoredAnonymousSession {
  if (
    stored &&
    nowMs - stored.createdAt >= 0 &&
    nowMs - stored.createdAt < ANALYTICS_SESSION_TTL_MS
  ) {
    return stored;
  }
  return { id: createAnonymousSessionId(), createdAt: nowMs };
}

export function isAnalyticsSchemaMissing(error: {
  code?: string | null;
  message?: string | null;
} | null): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("analytics_events") ||
    message.includes("analytics_admin_summary")
  );
}
