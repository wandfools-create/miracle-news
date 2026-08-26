/**
 * Insight-specific soft filters for entertainment / life / viral content.
 * Stronger than generic RSS prefilter — Insight mixes soft content into news desks.
 * No OpenAI.
 */

import { hasHighImportanceSignals } from "@/lib/collection-candidates/candidateRecommendPostProcess";
import { getSportsCollectionSkipReason } from "@/lib/rss/sportsCollectionPolicy";

export type InsightSkipReason = {
  code: "insight_gossip" | "insight_lifestyle" | "insight_sports" | "insight_viral";
  detail: string;
  summary: string;
};

const GOSSIP_PATTERNS: RegExp[] = [
  /열애|스캔들|가십|이혼|결혼\s*설|파경|열애설/,
  /아이돌|걸그룹|보이그룹|팬미팅|컴백\s*무대|뮤직뱅크/,
  /예능|방송인|연예|셀럽|스타\s*커플|레드\s*카펫/,
  /깜짝\s*결혼|연하\s*여배우|연상\s*남배우|열애\s*인정/,
  /MC\s*하차|하차\s*선언|녹화\s*중|무대\s*난입/,
  /\b(celebrity|gossip|tabloid|idol|red\s+carpet|dating\s+rumor)\b/i,
];

const LIFESTYLE_PATTERNS: RegExp[] = [
  /맛집|여행\s*코스|뷰티|패션|쇼핑\s*팁|다이어트|레시피/,
  /꿀팁|라이프스타일|인테리어|육아\s*팁/,
  /\b(recipe|makeup|skincare|fashion\s+haul|lifestyle\s+tip)\b/i,
];

const VIRAL_PATTERNS: RegExp[] = [
  /소름\s*돋|충격\s*반전|알고\s*보니|헐\.|대박\s*실화/,
  /웃긴\s*영상|레전드\s*모음|핫클립/,
  /\b(you\s+won't\s+believe|shocking\s+twist|gone\s+viral)\b/i,
];

function combined(title: string, summary?: string | null): string {
  return `${title || ""}\n${summary || ""}`.trim();
}

function insightSoftDeskPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return (
      path.includes("/enter") ||
      path.includes("/life") ||
      path.includes("/trend") ||
      path.includes("/sports")
    );
  } catch {
    return false;
  }
}

/**
 * Return skip reason for Insight soft content, or null to keep.
 * High-importance political/social signals override gossip demotion.
 */
export function getInsightCollectionSkipReason(input: {
  title: string;
  summary?: string | null;
  url: string;
}): InsightSkipReason | null {
  const text = combined(input.title, input.summary);
  if (!text) return null;

  if (insightSoftDeskPath(input.url)) {
    return {
      code: "insight_gossip",
      detail: "insight_soft_desk_path",
      summary: "인사이트 연예·생활·트렌드 경로 제외",
    };
  }

  if (hasHighImportanceSignals(input.title, input.summary || "")) {
    return null;
  }

  const sports = getSportsCollectionSkipReason({
    title: input.title,
    summary: input.summary,
    url: input.url,
  });
  if (sports) {
    return {
      code: "insight_sports",
      detail: sports.detail,
      summary: sports.summary,
    };
  }

  if (GOSSIP_PATTERNS.some((p) => p.test(text))) {
    return {
      code: "insight_gossip",
      detail: "insight_entertainment_gossip",
      summary: "인사이트 연예·가십 제외",
    };
  }
  if (LIFESTYLE_PATTERNS.some((p) => p.test(text))) {
    return {
      code: "insight_lifestyle",
      detail: "insight_lifestyle",
      summary: "인사이트 생활·바이럴성 콘텐츠 제외",
    };
  }
  if (VIRAL_PATTERNS.some((p) => p.test(text))) {
    return {
      code: "insight_viral",
      detail: "insight_viral",
      summary: "인사이트 바이럴·흥미 콘텐츠 제외",
    };
  }
  return null;
}
