import { getArticleRegion, type ArticleRegion } from "./articleRegion";
import type { HomeArticleCard } from "./types";

const BATCH_SIZE = 2;

/**
 * Interleave US and Korea articles (~50:50): up to 2 US, then up to 2 KR, repeat.
 * Input should already be sorted by recency; order is preserved within each region.
 */
export function balanceLatestByRegion(
  pool: HomeArticleCard[],
  limit = 8
): HomeArticleCard[] {
  if (pool.length === 0) return [];

  const us: HomeArticleCard[] = [];
  const kr: HomeArticleCard[] = [];

  for (const article of pool) {
    if (getArticleRegion(article) === "kr") {
      kr.push(article);
    } else {
      us.push(article);
    }
  }

  if (us.length === 0) return kr.slice(0, limit);
  if (kr.length === 0) return us.slice(0, limit);

  const result: HomeArticleCard[] = [];
  let ui = 0;
  let ki = 0;
  let turn: ArticleRegion = "us";

  while (result.length < limit && (ui < us.length || ki < kr.length)) {
    if (turn === "us" && ui < us.length) {
      const take = Math.min(BATCH_SIZE, us.length - ui);
      for (let i = 0; i < take && result.length < limit; i++) {
        result.push(us[ui++]);
      }
      turn = "kr";
      continue;
    }

    if (turn === "kr" && ki < kr.length) {
      const take = Math.min(BATCH_SIZE, kr.length - ki);
      for (let i = 0; i < take && result.length < limit; i++) {
        result.push(kr[ki++]);
      }
      turn = "us";
      continue;
    }

    if (ui < us.length) {
      turn = "us";
    } else if (ki < kr.length) {
      turn = "kr";
    } else {
      break;
    }
  }

  return result;
}
