import type {
  EditorialCollectionRule,
  EditorialRuleDecision,
} from "./types";

const CASUALTY_SIGNAL = /(?:\b\d{1,6}\s*(?:dead|killed|injured|missing|casualt(?:y|ies))\b|(?:사망|숨져|부상|실종|희생자)\s*\d{1,6}|\d{1,6}\s*(?:명|명이)\s*(?:사망|숨져|부상|실종))/iu;
const GOVERNMENT_SIGNAL = /\b(?:government|president|prime minister|congress|parliament|supreme court|united nations|nato|eu)\b|(?:정부|대통령|총리|국회|대법원|헌법재판소|유엔|나토|유럽연합)/iu;
const INTERNATIONAL_SIGNAL = /\b(?:war|invasion|missile|nuclear|sanction|treaty|diplomatic|refugee|human rights)\b|(?:전쟁|침공|미사일|핵무기|제재|조약|외교|난민|인권)/iu;

export function normalizeEditorialText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordMatches(text: string, keyword: string): boolean {
  const normalized = normalizeEditorialText(keyword);
  if (!normalized) return false;
  // Korean/Japanese/Chinese phrases need substring matching for particles and spacing.
  if (/[^\x00-\x7f]/u.test(normalized)) return text.includes(normalized);
  // ASCII words use boundaries, preventing e.g. "tar" from matching "target".
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:s|es)?(?:$|[^a-z0-9])`, "iu").test(text);
}

export function detectEditorialExceptionSignals(textInput: string): string[] {
  const text = normalizeEditorialText(textInput);
  const signals: string[] = [];
  if (CASUALTY_SIGNAL.test(text)) signals.push("casualty");
  if (GOVERNMENT_SIGNAL.test(text)) signals.push("government-policy");
  if (INTERNATIONAL_SIGNAL.test(text)) signals.push("international-impact");
  return signals;
}

export function evaluateEditorialRules(
  input: {
    title: string;
    summary?: string | null;
    sourceKey: string;
    categories?: string[];
  },
  rules: EditorialCollectionRule[]
): EditorialRuleDecision {
  const text = normalizeEditorialText(
    [input.title, input.summary ?? "", ...(input.categories ?? [])].join(" ")
  );
  const sorted = rules
    .filter((rule) => rule.isActive)
    .filter((rule) => !rule.sourceKey || rule.sourceKey === input.sourceKey)
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

  for (const rule of sorted) {
    const hits = rule.keywords.filter((keyword) => keywordMatches(text, keyword));
    if (hits.length === 0) continue;

    const exceptionSignals = detectEditorialExceptionSignals(text);
    const action =
      rule.action === "exclude" && exceptionSignals.length > 0
        ? "review"
        : rule.action;
    return {
      action,
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      matchedKeywords: hits,
      reason:
        action === "review" && rule.action === "exclude"
          ? `제외 규칙과 중요 예외 신호가 함께 감지됨: ${exceptionSignals.join(", ")}`
          : `${rule.name}: ${hits.slice(0, 3).join(", ")}`,
      exceptionSignals,
    };
  }

  return {
    action: "none",
    ruleId: null,
    ruleName: null,
    priority: 0,
    matchedKeywords: [],
    reason: "일치 규칙 없음",
    exceptionSignals: [],
  };
}
