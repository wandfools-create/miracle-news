/** Admin collection rules (free pre-AI filters). No OpenAI. */

export type EditorialRuleAction =
  | "always_keep"
  | "prioritize"
  | "review"
  | "exclude";

export type EditorialRuleKind = "keyword" | "category" | "source";

/** Matches CollectRegion plus an all-regions option. */
export type EditorialRuleRegion = "all" | "us-intl" | "korea";

export type EditorialCollectionRule = {
  id: string;
  name: string;
  kind: EditorialRuleKind;
  action: EditorialRuleAction;
  keywords: string[];
  category: string | null;
  sourceKey: string | null;
  region: EditorialRuleRegion;
  priority: number;
  isActive: boolean;
  isSystem: boolean;
  adminNote: string | null;
};

export type EditorialRuleDecision = {
  action: EditorialRuleAction | "none";
  ruleId: string | null;
  ruleName: string | null;
  priority: number;
  matchedKeywords: string[];
  reason: string;
  exceptionSignals: string[];
  /** True when exclude matched but exception kept item in review. */
  rescuedFromExclude: boolean;
};

export const EDITORIAL_ACTION_LABELS: Record<EditorialRuleAction, string> = {
  always_keep: "항상 후보로 유지",
  prioritize: "우선 검토",
  review: "일반 검토로 유지",
  exclude: "자동 제외",
};

export const EDITORIAL_KIND_LABELS: Record<EditorialRuleKind, string> = {
  keyword: "사용자 지정 키워드",
  category: "카테고리",
  source: "출처",
};

export const EDITORIAL_REGION_LABELS: Record<EditorialRuleRegion, string> = {
  all: "전체",
  korea: "한국",
  "us-intl": "미국·국제",
};
