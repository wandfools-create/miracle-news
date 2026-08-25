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
  {
    key: "bbc",
    label: "BBC World",
    aliases: ["BBC", "BBC News", "BBC World"],
    description: "국제 · 세계 뉴스",
  },
  {
    key: "sciencedaily",
    label: "ScienceDaily",
    aliases: ["ScienceDaily", "Science Daily"],
    description: "과학 · 기술 · 연구",
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
  {
    key: "yonhap",
    label: "Yonhap News Agency",
    aliases: ["Yonhap", "Yonhap News", "연합뉴스"],
    description:
      "한국 · 국제 · 영문 통신 (영문 RSS 자동 수집 비활성 — 기존 기사만 표시)",
  },
  {
    key: "korea-herald",
    label: "The Korea Herald",
    aliases: ["Korea Herald", "The Korea Herald", "코리아헤럴드"],
    description: "한국 · 영문 종합",
  },
];

/** Desk-only / auxiliary collectors — not home source leads. */
export const auxiliarySourceConfigs: SourceConfig[] = [
  {
    key: "yonhap-kr-radar",
    label: "연합뉴스 속보",
    aliases: [
      "연합뉴스 속보",
      "Yonhap KR Radar",
      "Yonhap Radar",
      "yonhap-kr-radar",
    ],
    description: "한국어 연합뉴스 속보·중요 이슈 탐지 (sitemap 메타만, 본문 미수집)",
    excludeFromRecommendations: true,
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

/** All known outlets (includes auxiliary + legacy). */
export const sourceConfigs: SourceConfig[] = [
  ...primaryForeignSourceConfigs,
  ...koreanSourceConfigs,
  ...auxiliarySourceConfigs,
  ...legacySourceConfigs,
];

/** Home UI: source pills, leads, filters — no legacy/auxiliary outlets. */
export const featuredSourceConfigs: SourceConfig[] = [
  ...primaryForeignSourceConfigs,
  ...koreanSourceConfigs,
];
