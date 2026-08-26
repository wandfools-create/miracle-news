/**
 * RSS / Discord desk collect regions (US·intl morning vs Korea evening).
 */

export type CollectRegion = "us-intl" | "korea";

export const COLLECT_REGION_US_INTL: CollectRegion = "us-intl";
export const COLLECT_REGION_KOREA: CollectRegion = "korea";

/** Default per-run candidate caps (OpenAI never called here). */
export const RSS_MAX_CANDIDATES_US_INTL = 20;
export const RSS_MAX_CANDIDATES_KOREA = 15;

/** Source keys collected / briefed in the US·international morning desk. */
export const US_INTL_SOURCE_KEYS = [
  "ap",
  "pbs-newshour",
  "fox-news",
  "csm",
  "bbc",
  "sciencedaily",
  /** English KR outlet — morning intl desk (not native Korean evening). */
  "korea-herald",
] as const;

/** Source keys for Korea evening desk (joongang reserved — not collected yet). */
export const KOREA_SOURCE_KEYS = [
  "chosun",
  "tvchosun",
  "yonhap-kr-radar",
  "joongang",
  "insight",
] as const;

const US_SET = new Set<string>(US_INTL_SOURCE_KEYS);
const KR_SET = new Set<string>(KOREA_SOURCE_KEYS);

export function sourceKeysForCollectRegion(region: CollectRegion): string[] {
  return region === "korea" ? [...KOREA_SOURCE_KEYS] : [...US_INTL_SOURCE_KEYS];
}

export function isSourceInCollectRegion(
  sourceKey: string,
  region: CollectRegion
): boolean {
  const key = sourceKey.trim();
  return region === "korea" ? KR_SET.has(key) : US_SET.has(key);
}

export function parseCollectRegion(
  raw: string | null | undefined
): CollectRegion | null {
  const v = raw?.trim().toLowerCase();
  if (v === "us" || v === "us-intl" || v === "international") return "us-intl";
  if (v === "kr" || v === "korea" || v === "ko") return "korea";
  return null;
}

export function defaultMaxCandidatesForRegion(region: CollectRegion): number {
  return region === "korea"
    ? RSS_MAX_CANDIDATES_KOREA
    : RSS_MAX_CANDIDATES_US_INTL;
}

export function resolveMaxCandidatesForRegion(region: CollectRegion): number {
  if (region === "korea") {
    const raw = process.env.RSS_MAX_CANDIDATES_KR?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : RSS_MAX_CANDIDATES_KOREA;
    if (!Number.isFinite(parsed) || parsed <= 0) return RSS_MAX_CANDIDATES_KOREA;
    return Math.min(parsed, 200);
  }
  const raw = process.env.RSS_MAX_CANDIDATES_US?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : RSS_MAX_CANDIDATES_US_INTL;
  if (!Number.isFinite(parsed) || parsed <= 0) return RSS_MAX_CANDIDATES_US_INTL;
  return Math.min(parsed, 200);
}

/** ET local hour when this region's collect cron should run. */
export function collectHourEtForRegion(region: CollectRegion): number {
  return region === "korea" ? 20 : 8;
}

/** ET local hour when this region's Discord brief cron should run (+15m after collect). */
export function briefHourEtForRegion(region: CollectRegion): number {
  return region === "korea" ? 20 : 8;
}
