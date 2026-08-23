import { sourceConfigs } from "@/lib/article/sourceConfigs";
import {
  LEGACY_SOURCE_KEYS,
  PRIMARY_FOREIGN_SOURCE_KEYS,
  PRIMARY_KOREAN_SOURCE_KEYS,
} from "@/lib/article/sourceConstants";

export type ArticleRegion = "us" | "kr";

/** Known outlet keys — Korea */
export const KR_SOURCE_KEYS = new Set<string>(PRIMARY_KOREAN_SOURCE_KEYS);

/** Known outlet keys — US / international (includes legacy reuters for region only). */
export const US_SOURCE_KEYS = new Set<string>([
  ...PRIMARY_FOREIGN_SOURCE_KEYS,
  ...LEGACY_SOURCE_KEYS,
]);

const HOST_SUFFIX_TO_SOURCE_KEY: Array<{ suffix: string; key: string }> = [
  { suffix: "chosun.com", key: "chosun" },
  { suffix: "joongang.co.kr", key: "joongang" },
  { suffix: "tvchosun.com", key: "tvchosun" },
  { suffix: "insight.co.kr", key: "insight" },
  { suffix: "apnews.com", key: "ap" },
  { suffix: "foxnews.com", key: "fox-news" },
  { suffix: "pbs.org", key: "pbs-newshour" },
  { suffix: "cnn.com", key: "cnn" },
  { suffix: "csmonitor.com", key: "csm" },
  { suffix: "reuters.com", key: "reuters" },
  { suffix: "yna.co.kr", key: "yonhap" },
  { suffix: "koreaherald.com", key: "korea-herald" },
  { suffix: "bbc.co.uk", key: "bbc" },
  { suffix: "bbc.com", key: "bbc" },
  { suffix: "sciencedaily.com", key: "sciencedaily" },
];

const US_HOST_HINTS = [
  "foxnews.com",
  "apnews.com",
  "pbs.org",
  "cnn.com",
  "csmonitor.com",
  "reuters.com",
  "bbc.co.uk",
  "bbc.com",
  "sciencedaily.com",
];

function regionFromSourceKey(key: string): ArticleRegion | null {
  if (KR_SOURCE_KEYS.has(key)) return "kr";
  if (US_SOURCE_KEYS.has(key)) return "us";
  return null;
}

function matchSourceKeyFromHost(hostname: string): string | null {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  for (const { suffix, key } of HOST_SUFFIX_TO_SOURCE_KEY) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return key;
  }
  return null;
}

function matchSourceKeyFromLabel(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  for (const config of sourceConfigs) {
    if (config.key === lower) return config.key;
    if (config.aliases.some((alias) => alias.toLowerCase() === lower)) {
      return config.key;
    }
    if (
      config.aliases.some(
        (alias) =>
          alias.length >= 2 &&
          (lower.includes(alias.toLowerCase()) ||
            alias.toLowerCase().includes(lower))
      )
    ) {
      return config.key;
    }
  }

  if (/fox\s*news/i.test(trimmed)) return "fox-news";
  if (/\bassociated\s+press\b/i.test(trimmed) || lower === "ap") return "ap";
  if (/\bcnn\b/i.test(trimmed)) return "cnn";
  if (/christian\s+science\s+monitor/i.test(trimmed)) return "csm";
  if (/\breuters\b/i.test(trimmed)) return "reuters";

  if (/조선일보|중앙일보|tv조선|인사이트/.test(trimmed)) {
    if (trimmed.includes("조선")) return "chosun";
    if (trimmed.includes("중앙")) return "joongang";
    if (/tv\s*조선/i.test(trimmed)) return "tvchosun";
    if (trimmed.includes("인사이트")) return "insight";
  }

  return null;
}

function regionFromOriginalUrl(url: string | null | undefined): ArticleRegion | null {
  const raw = url?.trim();
  if (!raw) return null;

  try {
    const host = new URL(
      raw.startsWith("http") ? raw : `https://${raw}`
    ).hostname.toLowerCase();

    const fromKey = matchSourceKeyFromHost(host);
    if (fromKey) return regionFromSourceKey(fromKey);

    if (host.endsWith(".kr")) return "kr";
    if (US_HOST_HINTS.some((hint) => host === hint || host.endsWith(`.${hint}`))) {
      return "us";
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Resolve a canonical source config key from URL + stored source name. */
export function resolveArticleSourceKey(input: {
  source: string;
  original_url?: string | null;
}): string | null {
  const url = input.original_url?.trim();
  if (url) {
    try {
      const host = new URL(
        url.startsWith("http") ? url : `https://${url}`
      ).hostname;
      const fromHost = matchSourceKeyFromHost(host);
      if (fromHost) return fromHost;
    } catch {
      /* ignore */
    }
  }

  return matchSourceKeyFromLabel(input.source);
}

function regionFromSourceLabel(source: string): ArticleRegion | null {
  const key = matchSourceKeyFromLabel(source);
  if (key) return regionFromSourceKey(key);
  return null;
}

function parseSourceCountry(raw: string | null | undefined): ArticleRegion | null {
  const value = raw?.trim().toUpperCase();
  if (!value) return null;
  if (value === "US" || value === "USA" || value === "UNITED STATES") return "us";
  if (value === "KR" || value === "KO" || value === "KOREA") return "kr";
  return null;
}

export function getArticleRegionFromSignals(input: {
  source: string;
  original_url?: string | null;
  source_country?: string | null;
  title?: string;
  title_original?: string;
}): ArticleRegion {
  const key = resolveArticleSourceKey(input);
  if (key) {
    const fromKey = regionFromSourceKey(key);
    if (fromKey) return fromKey;
  }

  const fromUrl = regionFromOriginalUrl(input.original_url);
  if (fromUrl) return fromUrl;

  const fromLabel = regionFromSourceLabel(input.source);
  if (fromLabel) return fromLabel;

  const fromCountry = parseSourceCountry(input.source_country);
  if (fromCountry) return fromCountry;

  const text = `${input.title ?? ""} ${input.title_original ?? ""}`;
  const hasKo = /[\u3131-\uD79D]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);
  if (hasKo && !hasLatin) return "kr";
  if (hasLatin && !hasKo) return "us";

  return "us";
}

export function isSourceKeyForRegion(
  sourceKey: string,
  region: ArticleRegion
): boolean {
  if (region === "kr") return KR_SOURCE_KEYS.has(sourceKey);
  return US_SOURCE_KEYS.has(sourceKey);
}
