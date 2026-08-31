import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import {
  PRIMARY_FOREIGN_SOURCE_KEYS,
  PRIMARY_KOREAN_SOURCE_KEYS,
} from "@/lib/article/sourceConstants";
import {
  featuredSourceConfigs,
  koreanSourceConfigs,
  primaryForeignSourceConfigs,
  type SourceConfig,
} from "@/lib/article/sourceConfigs";
import { localizeSourceLabel } from "@/lib/article/sourceDisplayLabels";
import { normalizeSource } from "@/lib/article/normalizeSource";
import type { SourceLeadCard } from "./types";

export type HomeSourceGroup = "all" | "foreign" | "korean";

const FOREIGN_KEYS = new Set<string>(PRIMARY_FOREIGN_SOURCE_KEYS);
const KOREAN_KEYS = new Set<string>(PRIMARY_KOREAN_SOURCE_KEYS);

export function sourceKeyInHomeGroup(
  key: string,
  group: HomeSourceGroup
): boolean {
  if (group === "all") return true;
  const normalized = normalizeSource(key);
  if (group === "foreign") return FOREIGN_KEYS.has(normalized);
  return KOREAN_KEYS.has(normalized);
}

/** Featured home sources for a group — excludes auxiliary/legacy. */
export function featuredConfigsForGroup(group: HomeSourceGroup): SourceConfig[] {
  return featuredSourceConfigs.filter((c) => sourceKeyInHomeGroup(c.key, group));
}

export function homeSourceGroupButtonLabels(
  locale: ArticleLocale
): Record<HomeSourceGroup, string> {
  if (locale === "ko") {
    return { all: "전체", foreign: "미국·국제", korean: "한국" };
  }
  return {
    all: "All",
    foreign: "U.S. & International",
    korean: "Korean Outlets",
  };
}

export function displaySourceTabLabel(
  config: Pick<SourceConfig, "key" | "label">,
  locale: ArticleLocale
): string {
  return localizeSourceLabel(config.label, locale, config.key);
}

export function filterSourceLeadCardsByGroup(
  cards: SourceLeadCard[],
  group: HomeSourceGroup,
  selectedKey: string | null
): SourceLeadCard[] {
  let pool = cards.filter((c) => sourceKeyInHomeGroup(c.key, group));
  if (selectedKey) {
    const key = normalizeSource(selectedKey);
    pool = pool.filter((c) => normalizeSource(c.key) === key);
  }
  return pool;
}

/** Rounded pill control (e.g. clear filters). */
export function homePillButtonClass(): string {
  return "cursor-pointer rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 hover:text-news-navy active:scale-[0.98] active:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-news-navy";
}

/** Shared tab button classes for home section interactions. */
export function homeSectionTabClass(
  selected: boolean,
  enabled = true
): string {
  const base =
    "cursor-pointer rounded-sm px-3 py-2 text-xs font-semibold transition-colors sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-news-navy active:scale-[0.98]";
  if (selected) {
    return `${base} border-b-2 border-news-navy bg-neutral-50 text-news-navy`;
  }
  if (!enabled) {
    return `${base} cursor-not-allowed text-neutral-400 opacity-60`;
  }
  return `${base} text-neutral-600 hover:bg-neutral-100 hover:text-news-navy active:bg-neutral-200`;
}

export const HOME_SOURCE_GROUP_FOREIGN_KEYS = [...PRIMARY_FOREIGN_SOURCE_KEYS];
export const HOME_SOURCE_GROUP_KOREAN_KEYS = [...PRIMARY_KOREAN_SOURCE_KEYS];

export function listForeignSourceConfigs(): SourceConfig[] {
  return [...primaryForeignSourceConfigs];
}

export function listKoreanSourceConfigs(): SourceConfig[] {
  return [...koreanSourceConfigs];
}
