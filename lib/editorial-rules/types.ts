export type EditorialRuleAction = "prioritize" | "review" | "exclude";

export type EditorialCollectionRule = {
  id: string;
  name: string;
  action: EditorialRuleAction;
  keywords: string[];
  contentDescription: string | null;
  sourceKey: string | null;
  priority: number;
  isActive: boolean;
};

export type EditorialRuleDecision = {
  action: EditorialRuleAction | "none";
  ruleId: string | null;
  ruleName: string | null;
  priority: number;
  matchedKeywords: string[];
  reason: string;
  exceptionSignals: string[];
};
