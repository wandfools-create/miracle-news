import { isSameAnalyticsSite, normalizeAnalyticsHost } from "./types";

export type AnalyticsOriginCheck =
  | { ok: true }
  | { ok: false; error: "origin_not_allowed" };

/**
 * Public analytics endpoint origin policy:
 * - If Origin is present, it must match the request Host (same site).
 * - If Origin is absent, allow (same-origin fetch edge cases, keepalive).
 * - Cross-origin browser requests are rejected.
 */
export function validateAnalyticsOrigin(request: Request): AnalyticsOriginCheck {
  const origin = request.headers.get("origin");
  if (!origin) return { ok: true };

  let originHost: string | null = null;
  try {
    originHost = normalizeAnalyticsHost(new URL(origin).host);
  } catch {
    return { ok: false, error: "origin_not_allowed" };
  }

  const requestHost = normalizeAnalyticsHost(request.headers.get("host"));
  if (!originHost || !requestHost) {
    return { ok: false, error: "origin_not_allowed" };
  }

  if (isSameAnalyticsSite(originHost, requestHost)) {
    return { ok: true };
  }

  return { ok: false, error: "origin_not_allowed" };
}
