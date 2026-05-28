/** Major US / international outlets — home filters, source leads, region. */
export const PRIMARY_FOREIGN_SOURCE_KEYS = [
  "ap",
  "pbs-newshour",
  "fox-news",
  "cnn",
  "csm",
] as const;

export type PrimaryForeignSourceKey = (typeof PRIMARY_FOREIGN_SOURCE_KEYS)[number];

/** Major Korean outlets — home filters, source leads, region. */
export const PRIMARY_KOREAN_SOURCE_KEYS = [
  "chosun",
  "joongang",
  "tvchosun",
  "insight",
] as const;

export type PrimaryKoreanSourceKey = (typeof PRIMARY_KOREAN_SOURCE_KEYS)[number];

/** Legacy outlets — URL resolution only, excluded from recommendations. */
export const LEGACY_SOURCE_KEYS = ["reuters"] as const;

export const EXCLUDED_RECOMMENDATION_SOURCE_KEYS = new Set<string>([
  ...LEGACY_SOURCE_KEYS,
]);
