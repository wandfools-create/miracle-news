/**
 * Rule-based filter category for collection candidates.
 * Separate from article AI `category` — no OpenAI.
 */

export const CANDIDATE_CATEGORY_FILTERS = [
  { key: "all", label: "전체" },
  { key: "politics", label: "정치" },
  { key: "economy", label: "경제" },
  { key: "society", label: "사회" },
  { key: "world", label: "국제" },
  { key: "religion", label: "종교" },
  { key: "science_tech", label: "과학/기술" },
  { key: "major_issue", label: "주요 이슈" },
  { key: "other", label: "기타" },
] as const;

export type CandidateCategoryKey = Exclude<
  (typeof CANDIDATE_CATEGORY_FILTERS)[number]["key"],
  "all"
>;

export type CandidateCategoryFilterKey =
  (typeof CANDIDATE_CATEGORY_FILTERS)[number]["key"];

const LABEL_BY_KEY: Record<CandidateCategoryKey, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  religion: "종교",
  science_tech: "과학/기술",
  major_issue: "주요 이슈",
  other: "기타",
};

export function getCandidateCategoryLabel(key: CandidateCategoryKey): string {
  return LABEL_BY_KEY[key];
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

const MAJOR_ISSUE = [
  /\b(ukraine|gaza|israel|hamas|hostage|ceasefire|martial\s+law|emergency)\b/i,
  /\b(world\s+war|nuclear\s+threat|missile\s+launch|invasion)\b/i,
  /\b(breaking|crisis|catastrophe|disaster)\b/i,
  /(우크라이나|가자|이스라엘|하마스|비상계엄|전쟁\s*위기|핵\s*위협)/,
];

const POLITICS = [
  /\b(trump|biden|harris|congress|senate|parliament|election|campaign|ballot|democrat|republican|gop|white\s+house|capitol|impeach|president|prime\s+minister|cabinet|legislation|bill\s+passes|sanctions)\b/i,
  /\b(kim\s+jong|yoon|lee\s+jae|moon\s+jae|national\s+assembly)\b/i,
  /(대통령|국회|총선|대선|여야|청와대|백악관|탄핵|선거|의원|총리|내각|법안)/,
];

const ECONOMY = [
  /\b(stock|market|nasdaq|dow|s&p|inflation|interest\s+rate|fed\b|federal\s+reserve|gdp|tariff|trade\s+war|recession|unemployment|wage|crypto|bitcoin|oil\s+price|bond|bank\s+of|economy|economic|fiscal|budget|deficit)\b/i,
  /(증시|주식|금리|인플레|관세|경기|실업|환율|유가|경제|재정|예산|무역)/,
];

const SOCIETY = [
  /\b(crime|police|shooting|murder|school|university|hospital|healthcare|health\s+care|immigration|migrant|refugee|protest|housing|homeless|education|labor\s+union|strike|court\s+rules|lawsuit|vaccine|opioid)\b/i,
  /(범죄|경찰|총격|학교|대학|병원|의료|이민|시위|주택|교육|노조|파업|소송|백신)/,
];

const RELIGION = [
  /\b(church|vatican|pope|christian|catholic|protestant|islam|muslim|mosque|buddhist|temple|synagogue|jewish|hindu|faith|religion|pastor|bible|quran|ramadan|easter|christmas\s+mass)\b/i,
  /(교회|바티칸|교황|기독교|가톨릭|이슬람|모스크|불교|사찰|유대교|종교|목사|성경)/,
];

const SCIENCE_TECH = [
  /\b(nasa|spacex|ai\b|artificial\s+intelligence|chatgpt|openai|quantum|genome|crispr|climate\s+change|global\s+warming|scientist|researchers?\b|study\s+finds|peer[- ]reviewed|robot|semiconductor|chip\s+maker|software|cyber|malware|asteroid|telescope|particle|physics|biology|chemistry)\b/i,
  /(인공지능|반도체|양자|기후변화|연구진|과학자|우주|로켓|로봇|사이버|망원경)/,
];

const WORLD = [
  /\b(united\s+nations|\bun\b|nato|eu\b|european\s+union|foreign\s+minister|diplomat|embassy|geopolitic|international|overseas|abroad)\b/i,
  /\b(china|beijing|russia|moscow|europe|middle\s+east|asia[- ]pacific|africa|latin\s+america)\b/i,
  /(유엔|나토|외교|대사관|국제|해외|중국|러시아|유럽|중동)/,
];

/**
 * Classify a candidate for admin list filtering only.
 * Ambiguous → other. Source hints only when text is weak.
 */
export function classifyCandidateCategory(input: {
  source: string;
  rssTitle: string;
  rssSummary?: string | null;
}): CandidateCategoryKey {
  const source = (input.source || "").trim().toLowerCase();
  const text = `${input.rssTitle || ""}\n${input.rssSummary || ""}`.trim();

  if (!text) {
    if (source === "sciencedaily") return "science_tech";
    if (source === "bbc") return "world";
    return "other";
  }

  if (hasAny(text, MAJOR_ISSUE)) return "major_issue";
  if (hasAny(text, RELIGION)) return "religion";
  if (hasAny(text, POLITICS)) return "politics";
  if (hasAny(text, ECONOMY)) return "economy";
  if (hasAny(text, SCIENCE_TECH)) return "science_tech";
  if (hasAny(text, SOCIETY)) return "society";
  if (hasAny(text, WORLD)) return "world";

  if (source === "sciencedaily") return "science_tech";
  if (source === "bbc") return "world";

  return "other";
}

export function parseCandidateCategoryFilter(
  raw: string | null | undefined
): CandidateCategoryFilterKey {
  const value = raw?.trim() || "all";
  const allowed = new Set(
    CANDIDATE_CATEGORY_FILTERS.map((c) => c.key as string)
  );
  return allowed.has(value) ? (value as CandidateCategoryFilterKey) : "all";
}
