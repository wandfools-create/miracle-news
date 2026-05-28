import {
  KR_SOURCE_KEYS,
  resolveArticleSourceKey,
} from "@/lib/article/sourceRegion";
import { sourceConfigs } from "@/lib/article/sourceConfigs";

/** Internal DB marker for link-ingest rows without a resolved outlet. */
export const SOURCE_ADMIN_LINK_DRAFT = "AdminLinkDraft";

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
];

const INTERNAL_SOURCE_NORMALIZED = new Set([
  "adminlinkdraft",
  "admin-link-draft",
]);

export type ResolvedPublisherSource = {
  /** Value to store in articles.source when persisting. */
  source: string;
  label: string;
  sourceCountry: "KR" | "US";
};

export function isInternalArticleSource(source: string): boolean {
  const normalized = source.trim().toLowerCase().replace(/\s+/g, "-");
  return INTERNAL_SOURCE_NORMALIZED.has(normalized);
}

function matchSourceKeyFromHost(hostname: string): string | null {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  for (const { suffix, key } of HOST_SUFFIX_TO_SOURCE_KEY) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return key;
  }
  return null;
}

function labelForSourceKey(key: string): string {
  const config = sourceConfigs.find((c) => c.key === key);
  return config?.label ?? key;
}

function matchSourceKeyFromLabel(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  for (const config of sourceConfigs) {
    if (
      config.key === trimmed ||
      config.aliases.some(
        (alias) =>
          alias.toLowerCase() === trimmed.toLowerCase() ||
          trimmed.toLowerCase().includes(alias.toLowerCase())
      )
    ) {
      return config.key;
    }
  }
  return null;
}

function prettifyHostname(hostname: string): string {
  const base = hostname.replace(/^www\./i, "").split(".")[0] || hostname;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function labelForStoredSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "출처 미상";

  const fromKey = matchSourceKeyFromLabel(trimmed);
  if (fromKey) return labelForSourceKey(fromKey);

  const lower = trimmed.toLowerCase();
  const byKey = sourceConfigs.find((c) => c.key === lower);
  if (byKey) return byKey.label;

  return trimmed;
}

export type ResolvePublisherFromUrlOptions = {
  siteName?: string | null;
  channelName?: string | null;
};

/**
 * Resolve outlet from URL hostname, optional og:site_name, or channel name.
 */
export function resolvePublisherFromUrl(
  pageUrl: string,
  options?: ResolvePublisherFromUrlOptions
): ResolvedPublisherSource | null {
  const url = pageUrl.trim();
  if (!url) return null;

  let host = "";
  try {
    host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }

  const fromHost = matchSourceKeyFromHost(host);
  if (fromHost) {
    return {
      source: fromHost,
      label: labelForSourceKey(fromHost),
      sourceCountry: KR_SOURCE_KEYS.has(fromHost) ? "KR" : "US",
    };
  }

  const siteName = options?.siteName?.trim();
  if (siteName) {
    const fromSite = resolveArticleSourceKey({ source: siteName, original_url: url });
    if (fromSite) {
      return {
        source: fromSite,
        label: labelForSourceKey(fromSite),
        sourceCountry: KR_SOURCE_KEYS.has(fromSite) ? "KR" : "US",
      };
    }
    return {
      source: siteName,
      label: siteName,
      sourceCountry: /[\u3131-\uD79D]/.test(siteName) ? "KR" : "US",
    };
  }

  const channelName = options?.channelName?.trim();
  if (channelName) {
    const fromChannel = matchSourceKeyFromLabel(channelName);
    if (fromChannel) {
      return {
        source: fromChannel,
        label: labelForSourceKey(fromChannel),
        sourceCountry: KR_SOURCE_KEYS.has(fromChannel) ? "KR" : "US",
      };
    }
    return {
      source: channelName,
      label: channelName,
      sourceCountry: /[\u3131-\uD79D]/.test(channelName) ? "KR" : "US",
    };
  }

  const pretty = prettifyHostname(host);
  return {
    source: pretty,
    label: pretty,
    sourceCountry: host.endsWith(".kr") ? "KR" : "US",
  };
}

export type ArticleSourceDisplayInput = {
  source: string;
  original_url?: string | null;
};

/** Label for public/admin UI — never shows AdminLinkDraft when URL can be resolved. */
export function getArticleSourceLabel(input: ArticleSourceDisplayInput): string {
  const source = input.source?.trim() ?? "";

  if (!isInternalArticleSource(source)) {
    return labelForStoredSource(source);
  }

  const fromUrl = input.original_url?.trim()
    ? resolvePublisherFromUrl(input.original_url)
    : null;
  if (fromUrl) return fromUrl.label;

  return "링크 기반";
}

/** Pick articles.source on insert when only internal marker / empty was provided. */
export function resolveSourceForStorage(
  source: string | undefined,
  originalUrl: string,
  options?: ResolvePublisherFromUrlOptions
): string {
  const trimmed = source?.trim() ?? "";
  if (trimmed && !isInternalArticleSource(trimmed)) {
    return trimmed;
  }

  const fromUrl = resolvePublisherFromUrl(originalUrl, options);
  if (fromUrl) return fromUrl.source;

  return SOURCE_ADMIN_LINK_DRAFT;
}
