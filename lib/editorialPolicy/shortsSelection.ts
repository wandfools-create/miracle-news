/**
 * Shorts selection helpers aligned with EDITORIAL_POLICY.md.
 * Pure functions — no OpenAI, no auto-publish. Safe to import from PR #5 later.
 */

import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";
import {
  detectEditorialBeat,
  isMegaEvent,
  isPoliticsOrEconomyBeat,
  isSoftNews,
  type EditorialSignalInput,
} from "./signals";

/** Local copy to avoid circular import with shortsPolicy re-exports. */
const COUNT_MIN = 3;
const COUNT_MAX = 5;

export type ShortsSelectable = EditorialSignalInput & {
  id: string;
};

export type ShortsSelectionAdvice = {
  ok: boolean;
  recommendedCountMin: number;
  recommendedCountMax: number;
  politicsEconomyCount: number;
  politicsEconomyMajorityRecommended: boolean;
  warnings: string[];
  notes: string[];
};

/** Complex packs may shrink below 3 when balance quality matters more. */
export function recommendedShortsCountRange(input: {
  complexPoliticsEconomy?: boolean;
  singleIssueFocus?: boolean;
}): { min: number; max: number } {
  if (input.singleIssueFocus) return { min: 1, max: 1 };
  if (input.complexPoliticsEconomy) return { min: 2, max: 3 };
  return { min: COUNT_MIN, max: COUNT_MAX };
}

export function countPoliticsEconomyArticles(
  articles: EditorialSignalInput[]
): number {
  return articles.filter((a) => {
    if (isMegaEvent(a)) return true;
    return isPoliticsOrEconomyBeat(detectEditorialBeat(a));
  }).length;
}

/**
 * Soft guidance for human selectors — never forces padding with weak politics.
 */
export function adviseShortsSelection(
  articles: EditorialSignalInput[],
  desk: ShortsDesk,
  options?: { allowBelowMinForComplexity?: boolean }
): ShortsSelectionAdvice {
  const warnings: string[] = [];
  const notes: string[] = [];
  const n = articles.length;
  const pe = countPoliticsEconomyArticles(articles);
  const soft = articles.filter((a) => isSoftNews(a)).length;
  const mega = articles.some((a) => isMegaEvent(a));

  if (desk === "morning") {
    notes.push("아침: 미국 정치·경제·대미 정책의 한국 영향 우선");
  } else {
    notes.push("저녁: 한국 정치·경제 중심, 중요 미국 정책·시장 업데이트 포함");
  }

  const complex = pe >= 1 && n <= 3;
  const range = recommendedShortsCountRange({
    complexPoliticsEconomy: complex && options?.allowBelowMinForComplexity,
    singleIssueFocus: n === 1 && mega,
  });

  if (n === 0) {
    return {
      ok: false,
      recommendedCountMin: range.min,
      recommendedCountMax: range.max,
      politicsEconomyCount: 0,
      politicsEconomyMajorityRecommended: true,
      warnings: ["선택된 기사가 없습니다."],
      notes,
    };
  }

  if (!options?.allowBelowMinForComplexity) {
    if (n < COUNT_MIN) {
      warnings.push(`일반 브리핑은 ${COUNT_MIN}~${COUNT_MAX}건을 권장합니다.`);
    }
  } else if (n < range.min) {
    warnings.push(`이 유형은 ${range.min}~${range.max}건을 권장합니다.`);
  }

  if (n > COUNT_MAX) {
    warnings.push(`최대 ${COUNT_MAX}건을 넘기지 마세요.`);
  }

  const majorityNeeded = Math.ceil(n / 2);
  const majorityOk = mega || pe >= majorityNeeded;
  if (!majorityOk) {
    warnings.push(
      `정치·경제 과반을 권장합니다 (현재 ${pe}/${n}). 후보가 부족하면 억지로 채우지 마세요.`
    );
  }

  if (soft > 0 && !mega) {
    warnings.push("소프트뉴스(왕실·연예 등)는 후순위입니다.");
  }

  notes.push("SAME EVENT 반복 제외 · DIFFERENT ANGLE은 차이를 설명할 수 있을 때만");
  notes.push("자동 공개·자동 업로드 금지 · 사람 검토 유지");

  return {
    ok: warnings.length === 0,
    recommendedCountMin: range.min,
    recommendedCountMax: range.max,
    politicsEconomyCount: pe,
    politicsEconomyMajorityRecommended: majorityOk,
    warnings,
    notes,
  };
}

/** Desk preference score for sorting picker lists (higher = better fit). */
export function shortsDeskFitScore(
  article: EditorialSignalInput,
  desk: ShortsDesk
): number {
  const beat = detectEditorialBeat(article);
  let score = 0;
  if (isMegaEvent(article)) score += 50;

  if (desk === "morning") {
    if (beat === "us_politics_economy") score += 40;
    if (beat === "foreign_security") score += 25;
    if (beat === "kr_politics_economy") score += 15;
  } else {
    if (beat === "kr_politics_economy") score += 40;
    if (beat === "us_politics_economy") score += 22;
    if (beat === "foreign_security") score += 18;
  }

  if (beat === "soft_news") score -= 30;
  return score;
}
