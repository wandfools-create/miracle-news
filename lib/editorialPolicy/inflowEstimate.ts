/**
 * Estimate politics/economy share under current vs preferred collection mixes.
 * Pure math — feed with READ-ONLY 7d aggregates; does not run RSS.
 */

export type SourceCategoryCount = {
  sourceKey: string;
  category: string;
  count: number;
};

export type InflowEstimate = {
  total: number;
  politicsEconomy: number;
  politicsEconomyShare: number;
  bySource: Array<{
    sourceKey: string;
    total: number;
    politicsEconomy: number;
    share: number;
  }>;
  /** Soft target: raise PE share without new paid sources. */
  recommendedPeShareMin: number;
  gapToTarget: number;
};

const PE_CATEGORIES = new Set([
  "politics",
  "economy",
  "world",
  "major_issue",
]);

export function isPoliticsEconomyCategory(category: string): boolean {
  return PE_CATEGORIES.has(category.trim().toLowerCase());
}

export function estimateEditorialInflow(
  rows: SourceCategoryCount[],
  options?: { recommendedPeShareMin?: number }
): InflowEstimate {
  const recommendedPeShareMin = options?.recommendedPeShareMin ?? 0.55;
  const bySourceMap = new Map<
    string,
    { total: number; politicsEconomy: number }
  >();

  let total = 0;
  let politicsEconomy = 0;

  for (const row of rows) {
    const n = Math.max(0, row.count);
    total += n;
    const pe = isPoliticsEconomyCategory(row.category) ? n : 0;
    politicsEconomy += pe;
    const cur = bySourceMap.get(row.sourceKey) ?? {
      total: 0,
      politicsEconomy: 0,
    };
    cur.total += n;
    cur.politicsEconomy += pe;
    bySourceMap.set(row.sourceKey, cur);
  }

  const bySource = [...bySourceMap.entries()]
    .map(([sourceKey, v]) => ({
      sourceKey,
      total: v.total,
      politicsEconomy: v.politicsEconomy,
      share: v.total > 0 ? v.politicsEconomy / v.total : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const politicsEconomyShare = total > 0 ? politicsEconomy / total : 0;

  return {
    total,
    politicsEconomy,
    politicsEconomyShare,
    bySource,
    recommendedPeShareMin,
    gapToTarget: Math.max(0, recommendedPeShareMin - politicsEconomyShare),
  };
}

/**
 * Project inserts if pass-2 prefers PE categories by `boost` (0–1 extra weight).
 * Does not change live caps — planning only.
 */
export function projectPeBiasedInflow(
  rows: SourceCategoryCount[],
  boost = 0.25
): InflowEstimate {
  const weighted = rows.map((row) => ({
    ...row,
    count: isPoliticsEconomyCategory(row.category)
      ? Math.round(row.count * (1 + boost))
      : row.count,
  }));
  return estimateEditorialInflow(weighted);
}
