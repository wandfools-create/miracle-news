import { isAnalyticsSchemaMissing } from "./types";

export const PUBLIC_ANALYTICS_ERROR_CODES = [
  "event_not_allowed",
  "missing_session",
  "invalid_path",
  "invalid_article_id",
  "invalid_search_query",
  "payload_too_large",
  "invalid_json",
  "origin_not_allowed",
  "analytics_unavailable",
  "analytics_store_failed",
] as const;

export type PublicAnalyticsErrorCode =
  (typeof PUBLIC_ANALYTICS_ERROR_CODES)[number];

const PUBLIC_ERROR_SET = new Set<string>(PUBLIC_ANALYTICS_ERROR_CODES);

export function isPublicAnalyticsErrorCode(
  value: string
): value is PublicAnalyticsErrorCode {
  return PUBLIC_ERROR_SET.has(value);
}

export function toPublicAnalyticsError(
  internalError: string,
  dbError?: { code?: string | null; message?: string | null } | null
): PublicAnalyticsErrorCode {
  if (isPublicAnalyticsErrorCode(internalError)) {
    return internalError;
  }

  if (
    internalError.includes("env") ||
    internalError.includes("DNS") ||
    internalError.includes("dns") ||
    internalError.includes("SUPABASE") ||
    internalError.includes("supabase")
  ) {
    return "analytics_unavailable";
  }

  if (isAnalyticsSchemaMissing(dbError ?? { message: internalError })) {
    return "analytics_unavailable";
  }

  return "analytics_store_failed";
}

export function publicAnalyticsHttpStatus(
  code: PublicAnalyticsErrorCode
): number {
  if (code === "origin_not_allowed") return 403;
  if (code === "analytics_unavailable") return 503;
  return 400;
}
