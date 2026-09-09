/**
 * Read-only preview of editorial rules against recent candidates.
 * Never mutates candidates or calls OpenAI.
 */

import type { CollectRegion } from "@/lib/rss/collectRegions";
import { evaluateEditorialRules } from "./evaluateEditorialRules";
import type { EditorialCollectionRule, EditorialRuleAction } from "./types";

export type EditorialPreviewItem = {
  id: string;
  title: string;
  sourceKey: string;
  action: EditorialRuleAction | "none";
  ruleName: string | null;
  reason: string;
  rescuedFromExclude: boolean;
  matchedKeywords: string[];
};

export type EditorialPreviewSummary = {
  scanned: number;
  byAction: Record<EditorialRuleAction | "none", number>;
  rescuedCount: number;
  samplesByAction: Partial<
    Record<EditorialRuleAction | "none", Array<{ title: string; reason: string }>>
  >;
  items: EditorialPreviewItem[];
};

export function previewEditorialRulesOnCandidates(
  candidates: Array<{
    id: string;
    title: string;
    summary?: string | null;
    sourceKey: string;
    categories?: string[];
    collectRegion?: CollectRegion | null;
  }>,
  rules: EditorialCollectionRule[],
  options?: { limit?: number }
): EditorialPreviewSummary {
  const limit = Math.max(1, Math.min(100, options?.limit ?? 100));
  const slice = candidates.slice(0, limit);
  const byAction: EditorialPreviewSummary["byAction"] = {
    always_keep: 0,
    prioritize: 0,
    review: 0,
    exclude: 0,
    none: 0,
  };
  const samplesByAction: EditorialPreviewSummary["samplesByAction"] = {};
  const items: EditorialPreviewItem[] = [];
  let rescuedCount = 0;

  for (const c of slice) {
    const decision = evaluateEditorialRules(
      {
        title: c.title,
        summary: c.summary,
        sourceKey: c.sourceKey,
        categories: c.categories,
        collectRegion: c.collectRegion,
      },
      rules
    );
    byAction[decision.action] += 1;
    if (decision.rescuedFromExclude) rescuedCount += 1;

    const sampleBucket = samplesByAction[decision.action] ?? [];
    if (sampleBucket.length < 3) {
      sampleBucket.push({ title: c.title.slice(0, 160), reason: decision.reason });
      samplesByAction[decision.action] = sampleBucket;
    }

    items.push({
      id: c.id,
      title: c.title.slice(0, 200),
      sourceKey: c.sourceKey,
      action: decision.action,
      ruleName: decision.ruleName,
      reason: decision.reason,
      rescuedFromExclude: decision.rescuedFromExclude,
      matchedKeywords: decision.matchedKeywords.slice(0, 5),
    });
  }

  return {
    scanned: slice.length,
    byAction,
    rescuedCount,
    samplesByAction,
    items,
  };
}
