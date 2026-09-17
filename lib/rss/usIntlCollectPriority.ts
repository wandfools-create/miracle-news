/**
 * US·international collect save priority (title / RSS summary / source only).
 * Title / RSS summary / source only — never calls an LLM.
 * Used to order eligible items before feed-cap and run-limit cuts.
 */

import { detectEditorialExceptionSignals } from "@/lib/editorial-rules/exceptionSignals";
import { normalizeEditorialText } from "@/lib/editorial-rules/matchKeywords";
import {
  detectStrongPublicHealthSignal,
  isSoftPublicHealthNoise,
} from "@/lib/editorial-rules/publicHealthSignals";

/** Lower number = higher urgency. */
export type UsIntlCollectPriority = 0 | 1 | 2 | 3;

export type UsIntlPriorityInput = {
  title: string;
  summary?: string | null;
  sourceKey?: string | null;
};

const P0_SECURITY =
  /\b(?:war|warfare|invasion|invade[sd]?|missile[s]?|airstrike[s]?|air strike[s]?|rocket attack|ceasefire|cease-fire|truce|armistice|nuclear (?:weapon|warhead|strike)|national security crisis|security crisis|armed conflict|troop(?:s)? (?:deploy|advance|cross)|ground offensive|bombard(?:ment|ed)?)\b|(?:전쟁|침공|미사일|공습|휴전|정전|핵무기|안보\s*위기|무력\s*충돌|공세)/iu;

const P0_ATTACK =
  /\b(?:terror(?:ist|ism)? attack|bomb(?:ing|ed)?|explosion kills|mass shooting|hostage|assassination)\b|(?:테러\s*공격|폭탄\s*테러|폭발로\s*\d|인질|암살)/iu;

const P1_US_POLITICS =
  /\b(?:white house|congress|senate|house of representatives|capitol hill|supreme court|president trump|donald trump|biden|federal (?:judge|court|government)|impeach(?:ment)?|executive order|midterm|primary election|governor|attorney general|department of justice|\bdoj\b|\bfbi\b|pentagon|state department)\b|(?:백악관|미\s*의회|상원|하원|연방\s*대법원|트럼프|바이든|탄핵|행정명령|연준(?!\s*금리))/iu;

const P1_DIPLOMACY_CONFLICT =
  /\b(?:diplomat(?:ic|s)?|sanctions?|nato|united nations|\bun\s+general assembly|geopolitics|foreign (?:policy|minister)|state visit|embassy|ukraine|russia|iran|israel|gaza|houthi|taiwan|south china sea|north korea)\b|(?:외교|제재|나토|유엔|지정학|우크라이나|러시아|이란|이스라엘|가자|후티|대만|북한)/iu;

const P1_WORLD_ECONOMY =
  /\b(?:tariff[s]?|trade war|interest rate[s]?|federal reserve|\bthe fed\b|inflation|cpi\b|recession|stock market|wall street|central bank|opec|crude oil price|currency|forex|bond yield)\b|(?:관세|무역\s*전쟁|금리|연준|인플레이션|물가|경기\s*침체|증시|중앙은행|유가)/iu;

/** Soft / non-core desks that must not consume P0–P2 slots. */
const NON_CORE_LIFESTYLE =
  /(?:\bhoroscope\b|\bzodiac\b|daily horoscope|운세|오늘의\s*운세|별자리)|(?:\binspirational quote\b|\bquotes?\s+of\s+the\s+day\b|명언|좋은\s*글|감동\s*사연|heartwarming|feel-good story)|(?:\bcelebrity\b|\bred carpet\b|\bk-?pop\b|\bidol\b|연예|아이돌|팬미팅|엔터테인먼트|entertainment news)|(?:\brecipe\b|\btravel tip\b|\bfashion week\b|\bskincare\b|맛집|여행\s*팁|패션|레시피|lifestyle)|(?:\blocal (?:festival|fair|event)\b|community fair|지역\s*행사|축제\s*홍보)|(?:\bweird science\b|\bfun fact\b|curious science|신기한\s*발견|흥미\s*과학)|(?:\bexo\b|\bbts\b|\bsnapchat\b|\btiktok\b|\binstagram influencer\b)/iu;

export function combineUsIntlPriorityText(input: UsIntlPriorityInput): string {
  return normalizeEditorialText(
    [input.title, input.summary ?? ""].filter(Boolean).join(" ")
  );
}

export function detectUsIntlP0(text: string): boolean {
  if (!text) return false;
  if (detectStrongPublicHealthSignal(text)) return true;
  if (P0_SECURITY.test(text) || P0_ATTACK.test(text)) return true;
  return false;
}

export function detectUsIntlP1(text: string): boolean {
  if (!text) return false;
  return (
    P1_US_POLITICS.test(text) ||
    P1_DIPLOMACY_CONFLICT.test(text) ||
    P1_WORLD_ECONOMY.test(text)
  );
}

/**
 * Soft lifestyle / entertainment / curiosity content.
 * Strong exception or P0 signals override (not treated as non-core).
 */
export function isUsIntlNonCoreLifestyle(input: UsIntlPriorityInput): boolean {
  const text = combineUsIntlPriorityText(input);
  if (!text) return false;
  if (detectUsIntlP0(text)) return false;
  if (detectEditorialExceptionSignals(text).length > 0) return false;
  if (isSoftPublicHealthNoise(text) && !detectStrongPublicHealthSignal(text)) {
    return true;
  }
  return NON_CORE_LIFESTYLE.test(text);
}

/**
 * Score save priority for a US·intl RSS item.
 * P0 infectious/war → P1 politics/diplomacy/economy → P2 normal → P3 weak/unclear.
 */
export function scoreUsIntlCollectPriority(
  input: UsIntlPriorityInput
): UsIntlCollectPriority {
  const text = combineUsIntlPriorityText(input);
  if (detectUsIntlP0(text)) return 0;
  if (detectUsIntlP1(text)) return 1;
  if (isUsIntlNonCoreLifestyle(input)) return 3;
  // Weak / thin titles without hard desks stay P3 so they do not pad the run.
  const tokenCount = text.split(/\s+/).filter(Boolean).length;
  if (tokenCount > 0 && tokenCount <= 4 && !detectEditorialExceptionSignals(text).length) {
    return 3;
  }
  return 2;
}

/** Field-profile excludes that P0/P1 may bypass (misclassification / unclassified). */
export function isUsIntlPriorityBypassFieldDecisionKey(
  decisionKey: string
): boolean {
  const key = decisionKey.trim().toLowerCase();
  if (key === "unclassified-reject") return true;
  if (key === "science-lifestyle-disabled") return true;
  if (key.startsWith("field-disabled:")) return true;
  return false;
}

export function shouldBypassUsIntlFieldExclude(input: {
  priority: UsIntlCollectPriority;
  decisionKey: string;
}): boolean {
  if (input.priority > 1) return false;
  return isUsIntlPriorityBypassFieldDecisionKey(input.decisionKey);
}

/** True when this priority may consume a save slot (P0–P2 only). */
export function isUsIntlSaveEligiblePriority(
  priority: UsIntlCollectPriority
): boolean {
  return priority <= 2;
}

export type UsIntlPriorityCandidate<T> = {
  item: T;
  priority: UsIntlCollectPriority;
  /** Epoch ms; missing → 0 (sorts last within same priority). */
  publishedAtMs: number;
  feedIndex: number;
  sourceKey: string;
  feedUrl: string;
  independentInsertCap: boolean;
  maxInserts: number;
};

export type UsIntlPrioritySelectionResult<T> = {
  /** Selected items grouped by feedIndex (priority order within each). */
  selectedByFeed: Map<number, T[]>;
  /** Eligible P0–P2 dropped by per-feed / per-source cap. */
  feedCapDropped: Array<UsIntlPriorityCandidate<T>>;
  /** Eligible P0–P2 not selected because run limit would be exceeded. */
  runLimitUnprocessed: Array<UsIntlPriorityCandidate<T>>;
  /** P3 (or non-save) items discarded from queues. */
  nonSaveDropped: Array<UsIntlPriorityCandidate<T>>;
};

/**
 * Global priority selection before feed-cap and run-limit cuts.
 * Never pads the run with P3. Preserves relative priority across feeds.
 */
export function selectUsIntlItemsByPriority<T>(
  candidates: UsIntlPriorityCandidate<T>[],
  runLimit: number
): UsIntlPrioritySelectionResult<T> {
  const selectedByFeed = new Map<number, T[]>();
  const publisherCounts = new Map<string, number>();
  const feedUrlCounts = new Map<string, number>();
  const feedCapDropped: Array<UsIntlPriorityCandidate<T>> = [];
  const runLimitUnprocessed: Array<UsIntlPriorityCandidate<T>> = [];
  const nonSaveDropped: Array<UsIntlPriorityCandidate<T>> = [];
  let selectedCount = 0;

  const eligible = candidates
    .filter((c) => {
      if (!isUsIntlSaveEligiblePriority(c.priority)) {
        nonSaveDropped.push(c);
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (b.publishedAtMs !== a.publishedAtMs) {
        return b.publishedAtMs - a.publishedAtMs;
      }
      return a.feedIndex - b.feedIndex;
    });

  const limit =
    Number.isFinite(runLimit) && runLimit > 0
      ? Math.floor(runLimit)
      : Number.MAX_SAFE_INTEGER;

  for (const c of eligible) {
    if (selectedCount >= limit) {
      runLimitUnprocessed.push(c);
      continue;
    }

    const used = c.independentInsertCap
      ? feedUrlCounts.get(c.feedUrl) ?? 0
      : publisherCounts.get(c.sourceKey) ?? 0;
    if (used >= c.maxInserts) {
      feedCapDropped.push(c);
      continue;
    }

    const list = selectedByFeed.get(c.feedIndex) ?? [];
    list.push(c.item);
    selectedByFeed.set(c.feedIndex, list);
    selectedCount += 1;

    if (c.independentInsertCap) {
      feedUrlCounts.set(c.feedUrl, used + 1);
    } else {
      publisherCounts.set(c.sourceKey, used + 1);
    }
  }

  return {
    selectedByFeed,
    feedCapDropped,
    runLimitUnprocessed,
    nonSaveDropped,
  };
}

export function publishedAtMs(value: string | null | undefined): number {
  if (!value?.trim()) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}
