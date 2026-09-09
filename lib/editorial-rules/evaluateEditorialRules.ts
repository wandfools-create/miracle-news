import type { CollectRegion } from "@/lib/rss/collectRegions";

import { detectEditorialExceptionSignals } from "./exceptionSignals";
import { keywordMatches, normalizeEditorialText } from "./matchKeywords";
import type {
  EditorialCollectionRule,
  EditorialRuleAction,
  EditorialRuleDecision,
  EditorialRuleRegion,
} from "./types";

const ACTION_RANK: Record<EditorialRuleAction, number> = {
  always_keep: 4,
  prioritize: 3,
  review: 2,
  exclude: 1,
};

function regionApplies(
  ruleRegion: EditorialRuleRegion,
  collectRegion: CollectRegion | null | undefined
): boolean {
  if (ruleRegion === "all") return true;
  if (!collectRegion) return true;
  return ruleRegion === collectRegion;
}

function ruleMatchesItem(
  rule: EditorialCollectionRule,
  input: {
    title: string;
    summary?: string | null;
    sourceKey: string;
    categories?: string[];
    text: string;
  }
): { hit: boolean; matchedKeywords: string[] } {
  if (rule.sourceKey && rule.sourceKey !== input.sourceKey) {
    return { hit: false, matchedKeywords: [] };
  }

  if (rule.kind === "source") {
    // Source-scoped rule with empty keywords: match the whole source.
    if (!rule.sourceKey) return { hit: false, matchedKeywords: [] };
    if (rule.keywords.length === 0) {
      return { hit: true, matchedKeywords: [`source:${rule.sourceKey}`] };
    }
    const hits = rule.keywords.filter((k) => keywordMatches(input.text, k));
    return { hit: hits.length > 0, matchedKeywords: hits };
  }

  if (rule.kind === "category") {
    const cat = (rule.category ?? "").trim().toLowerCase();
    if (!cat) return { hit: false, matchedKeywords: [] };
    const cats = (input.categories ?? []).map((c) => c.trim().toLowerCase());
    const inCategories = cats.some((c) => c === cat || c.includes(cat));
    if (inCategories) {
      return { hit: true, matchedKeywords: [`category:${cat}`] };
    }
    // Also allow category name as keyword in title/summary when feed categories empty.
    if (keywordMatches(input.text, cat)) {
      return { hit: true, matchedKeywords: [`category-text:${cat}`] };
    }
    return { hit: false, matchedKeywords: [] };
  }

  // keyword
  const hits = rule.keywords.filter((k) => keywordMatches(input.text, k));
  return { hit: hits.length > 0, matchedKeywords: hits };
}

/**
 * Evaluate free admin collection rules.
 * Precedence: always_keep > prioritize > review > exclude(+exception→review) > none.
 * A single bad rule must not throw — callers wrap; matching itself is pure.
 */
export function evaluateEditorialRules(
  input: {
    title: string;
    summary?: string | null;
    sourceKey: string;
    categories?: string[];
    collectRegion?: CollectRegion | null;
  },
  rules: EditorialCollectionRule[]
): EditorialRuleDecision {
  const text = normalizeEditorialText(
    [input.title, input.summary ?? "", ...(input.categories ?? [])].join(" ")
  );

  const candidates: Array<{
    rule: EditorialCollectionRule;
    matchedKeywords: string[];
  }> = [];

  for (const rule of rules) {
    try {
      if (!rule.isActive) continue;
      if (!regionApplies(rule.region, input.collectRegion)) continue;
      const { hit, matchedKeywords } = ruleMatchesItem(rule, {
        ...input,
        text,
      });
      if (!hit) continue;
      candidates.push({ rule, matchedKeywords });
    } catch {
      // Skip malformed rule; do not abort evaluation.
      continue;
    }
  }

  if (candidates.length === 0) {
    return {
      action: "none",
      ruleId: null,
      ruleName: null,
      priority: 0,
      matchedKeywords: [],
      reason: "일치 규칙 없음",
      exceptionSignals: [],
      rescuedFromExclude: false,
    };
  }

  candidates.sort(
    (a, b) =>
      ACTION_RANK[b.rule.action] - ACTION_RANK[a.rule.action] ||
      b.rule.priority - a.rule.priority ||
      a.rule.name.localeCompare(b.rule.name)
  );

  const top = candidates[0]!;
  const exceptionSignals = detectEditorialExceptionSignals(text);

  if (top.rule.action === "exclude" && exceptionSignals.length > 0) {
    return {
      action: "review",
      ruleId: top.rule.id,
      ruleName: top.rule.name,
      priority: top.rule.priority,
      matchedKeywords: top.matchedKeywords,
      reason: `제외 규칙과 중요 예외 신호가 함께 감지됨: ${exceptionSignals.join(", ")}`,
      exceptionSignals,
      rescuedFromExclude: true,
    };
  }

  return {
    action: top.rule.action,
    ruleId: top.rule.id,
    ruleName: top.rule.name,
    priority: top.rule.priority,
    matchedKeywords: top.matchedKeywords,
    reason: `${top.rule.name}: ${top.matchedKeywords.slice(0, 3).join(", ")}`,
    exceptionSignals,
    rescuedFromExclude: false,
  };
}

/** Collect-time hard skip only when final action is exclude. */
export function shouldAutoExcludeEditorialDecision(
  decision: EditorialRuleDecision
): boolean {
  return decision.action === "exclude" && Boolean(decision.ruleId);
}
