export type SourceConfig = {
  key: string;
  label: string;
  aliases: string[];
  description: string;
  /** Omit from home source leads, filter chips, and default recommendations. */
  excludeFromRecommendations?: boolean;
};

export const primaryForeignSourceConfigs: SourceConfig[] = [
  {
    key: "ap",
    label: "AP",
    aliases: ["AP", "AP News", "Associated Press"],
    description: "미국 · 국제 · 일반 뉴스",
  },
  {
    key: "pbs-newshour",
    label: "PBS NewsHour",
    aliases: ["PBS NewsHour", "PBS"],
    description: "공공성 기반 시사 보도",
  },
  {
    key: "fox-news",
    label: "Fox News",
    aliases: ["Fox News"],
    description: "미국 정치 · 사회 이슈",
  },
  {
    key: "cnn",
    label: "CNN",
    aliases: ["CNN", "CNN.com", "Cable News Network"],
    description: "미국 · 국제 · 속보",
  },
  {
    key: "csm",
    label: "The Christian Science Monitor",
    aliases: [
      "The Christian Science Monitor",
      "Christian Science Monitor",
      "CS Monitor",
    ],
    description: "국제 · 종교 · 글로벌 · 심층 분석",
  },
];

export const koreanSourceConfigs: SourceConfig[] = [
  {
    key: "chosun",
    label: "조선일보",
    aliases: ["조선일보"],
    description: "한국 정치 · 사회 · 경제",
  },
  {
    key: "joongang",
    label: "중앙일보",
    aliases: ["중앙일보"],
    description: "한국 시사 · 사회 · 경제",
  },
  {
    key: "tvchosun",
    label: "TV조선",
    aliases: ["TV조선", "TV Chosun"],
    description: "방송 뉴스 · 정치 · 사회",
  },
  {
    key: "insight",
    label: "인사이트",
    aliases: ["인사이트", "Insight", "Insight.co.kr"],
    description: "대중 이슈 · 트렌드 · 사회",
  },
];

/** Recognized for URL/label normalization only — not promoted on home. */
export const legacySourceConfigs: SourceConfig[] = [
  {
    key: "reuters",
    label: "Reuters",
    aliases: ["Reuters"],
    description: "국제 · 속보 (기본 추천 제외)",
    excludeFromRecommendations: true,
  },
];

/** All known outlets (includes legacy). */
export const sourceConfigs: SourceConfig[] = [
  ...primaryForeignSourceConfigs,
  ...koreanSourceConfigs,
  ...legacySourceConfigs,
];

/** Home UI: source pills, leads, filters — no legacy outlets. */
export const featuredSourceConfigs: SourceConfig[] = [
  ...primaryForeignSourceConfigs,
  ...koreanSourceConfigs,
];
