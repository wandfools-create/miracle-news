/**
 * Rule-based post-processing for AI candidate recommend grades.
 * No OpenAI — runs after a single recommend call or on desk load.
 */

import type { AiRecommendGrade } from "@/lib/collection-candidates/candidateRecommend";
import { getSportsCollectionSkipReason } from "@/lib/rss/sportsCollectionPolicy";

export type AiRecommendPostProcessInput = {
  id: string;
  grade: AiRecommendGrade;
  score: number;
  reason: string;
  title: string;
  summary: string;
  source: string;
  originalUrl?: string;
  rssPublishedAt: string | null;
  createdAt?: string | null;
};

export type AiRecommendPostProcessOutput = AiRecommendPostProcessInput & {
  postProcessNote?: string;
};

/** Desk trust — higher keeps BEST when same-event cluster ties. */
const SOURCE_TRUST_SCORE: Record<string, number> = {
  ap: 100,
  bbc: 98,
  "pbs-newshour": 96,
  csm: 94,
  cnn: 90,
  "fox-news": 88,
  yonhap: 92,
  "korea-herald": 90,
  chosun: 88,
  joongang: 88,
  tvchosun: 86,
  insight: 82,
  sciencedaily: 84,
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "will",
  "after",
  "before",
  "into",
  "over",
  "about",
  "says",
  "said",
  "their",
  "they",
  "them",
  "its",
  "not",
  "but",
  "who",
  "what",
  "when",
  "where",
  "how",
  "why",
  "new",
  "news",
  "report",
  "reports",
  "update",
  "breaking",
  "기자",
  "속보",
  "단독",
  "종합",
  "오늘",
  "내일",
  "지난",
  "관련",
  "대해",
  "있다",
  "있다",
  "한다",
  "했다",
  "밝혔",
  "보도",
]);

/** Protect AI best/priority from sports·gossip demotion — never upgrades to best. */
const HIGH_IMPORTANCE_PATTERNS: RegExp[] = [
  /\b(breaking|urgent|developing|just\s+in)\b/i,
  /\b(war|invasion|airstrike|missile|ceasefire|hostage|martial\s+law)\b/i,
  /\b(election|ballot|impeach|runoff|primary\s+debate|campaign\s+finance)\b/i,
  /\b(diplomat|embassy|sanctions|summit|treaty|foreign\s+minister|state\s+department)\b/i,
  /\b(earthquake|hurricane|wildfire|flood|disaster|casualties|evacuat)\b/i,
  /\b(supreme\s+court|indicted|convicted|verdict|grand\s+jury)\b/i,
  /\b(government\s+shutdown|state\s+of\s+emergency|national\s+security)\b/i,
  /\b(president|prime\s+minister|white\s+house|pentagon|congress|parliament)\b/i,
  /(전쟁|침공|미사일|휴전|인질|비상계엄|선거|탄핵|외교|재난|지진|대법원|기소|정부|국회|대통령|총리)/,
];

const GOSSIP_PATTERNS: RegExp[] = [
  /\b(celebrity|celebrities|kardashian|hollywood|paparazzi|tabloid|gossip|entertainer|pop\s+star|boyband|dating\s+rumor|affair|breakup|red\s+carpet)\b/i,
  /\b(k-pop\s+idol|idol\s+group|fan\s+meeting|comeback\s+stage)\b/i,
  /(연예|가십|스캔들|열애|결혼\s*설|이혼|아이돌|드라마\s*배우|예능|방송인\s*열애)/,
];

const EVENT_CLUSTER_JACCARD = 0.42;

function combinedText(title: string, summary: string): string {
  return `${title || ""}\n${summary || ""}`.trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function hasHighImportanceSignals(title: string, summary: string): boolean {
  return hasAny(combinedText(title, summary), HIGH_IMPORTANCE_PATTERNS);
}

export function isGossipStory(title: string, summary: string): boolean {
  return hasAny(combinedText(title, summary), GOSSIP_PATTERNS);
}

/** Rule-based sports/gossip demotion target; null = keep AI grade. */
export function sportsGossipDemotionTarget(input: {
  title: string;
  summary: string;
  originalUrl?: string;
}): AiRecommendGrade | null {
  const text = combinedText(input.title, input.summary);
  if (hasHighImportanceSignals(input.title, input.summary)) return null;

  const sportsSkip = getSportsCollectionSkipReason({
    title: input.title,
    summary: input.summary,
    url: input.originalUrl || "https://example.com/",
  });
  if (sportsSkip) {
    return sportsSkip.code === "routine_sports" ? "low" : "normal";
  }

  if (isGossipStory(input.title, input.summary)) return "low";
  return null;
}

function tokenizeEvent(title: string, summary: string): Set<string> {
  const text = combinedText(title, summary).toLowerCase();
  const raw =
    text.match(/[\p{L}\p{N}]{3,}/gu) ??
    text.split(/\s+/).filter((w) => w.length >= 3);
  const tokens = new Set<string>();
  for (const word of raw) {
    const w = word.normalize("NFKC");
    if (STOPWORDS.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    tokens.add(w);
  }
  return tokens;
}

export function eventClusterJaccard(
  a: { title: string; summary: string },
  b: { title: string; summary: string }
): number {
  const setA = tokenizeEvent(a.title, a.summary);
  const setB = tokenizeEvent(b.title, b.summary);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return inter / union;
}

function sharedSignificantTokenCount(
  a: { title: string; summary: string },
  b: { title: string; summary: string }
): number {
  const setA = tokenizeEvent(a.title, a.summary);
  const setB = tokenizeEvent(b.title, b.summary);
  let count = 0;
  for (const token of setA) {
    if (setB.has(token)) count += 1;
  }
  return count;
}

export function clusterCandidatesByEvent<T extends AiRecommendPostProcessInput>(
  items: T[]
): T[][] {
  if (items.length === 0) return [];

  const parent = items.map((_, index) => index);

  function find(index: number): number {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = index;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  }

  function shouldCluster(a: T, b: T): boolean {
    if (sharedSignificantTokenCount(a, b) >= 4) return true;
    if (eventClusterJaccard(a, b) >= EVENT_CLUSTER_JACCARD) return true;
    return (
      eventClusterJaccard(
        { title: a.title, summary: "" },
        { title: b.title, summary: "" }
      ) >= 0.55
    );
  }

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (shouldCluster(items[i]!, items[j]!)) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  for (let i = 0; i < items.length; i += 1) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(items[i]!);
    groups.set(root, list);
  }

  return [...groups.values()];
}

function gradeRank(grade: AiRecommendGrade): number {
  switch (grade) {
    case "best":
      return 0;
    case "priority":
      return 1;
    case "normal":
      return 2;
    case "low":
      return 3;
  }
}

function minGrade(a: AiRecommendGrade, b: AiRecommendGrade): AiRecommendGrade {
  return gradeRank(a) >= gradeRank(b) ? a : b;
}

function representativeScore(item: AiRecommendPostProcessInput): number {
  const trust = SOURCE_TRUST_SCORE[item.source] ?? 70;
  const stamp = item.rssPublishedAt?.trim() || item.createdAt?.trim() || "";
  const time = Date.parse(stamp) || 0;
  const specificity =
    item.title.trim().length + (item.summary?.trim().length ?? 0);
  return trust * 1_000_000 + time + specificity * 10;
}

export function pickEventClusterRepresentative<T extends AiRecommendPostProcessInput>(
  cluster: T[]
): T {
  return [...cluster].sort(
    (a, b) => representativeScore(b) - representativeScore(a)
  )[0]!;
}

function demoteGrade(current: AiRecommendGrade, target: AiRecommendGrade): AiRecommendGrade {
  return minGrade(current, target);
}

function applySportsGossipDemotion(
  item: AiRecommendPostProcessInput
): AiRecommendPostProcessOutput {
  if (item.grade !== "best" && item.grade !== "priority") return { ...item };

  const target = sportsGossipDemotionTarget({
    title: item.title,
    summary: item.summary,
    originalUrl: item.originalUrl,
  });
  if (!target) return { ...item };

  const next = demoteGrade(item.grade, target);
  if (next === item.grade) return { ...item };

  return {
    ...item,
    grade: next,
    postProcessNote:
      next === "low"
        ? "규칙: 스포츠·가십 강등"
        : "규칙: 일반 스포츠 강등",
  };
}

function applySameEventBestCap(
  items: AiRecommendPostProcessOutput[]
): AiRecommendPostProcessOutput[] {
  const clusters = clusterCandidatesByEvent(items);
  const demoteIds = new Map<string, AiRecommendGrade>();

  for (const cluster of clusters) {
    const bestItems = cluster.filter((c) => c.grade === "best");
    if (bestItems.length <= 1) continue;

    const keeper = pickEventClusterRepresentative(bestItems);
    for (const item of bestItems) {
      if (item.id === keeper.id) continue;
      const fallback: AiRecommendGrade =
        item.score >= 70 ? "priority" : "normal";
      demoteIds.set(item.id, fallback);
    }
  }

  if (demoteIds.size === 0) return items;

  return items.map((item) => {
    const nextGrade = demoteIds.get(item.id);
    if (!nextGrade) return item;
    return {
      ...item,
      grade: nextGrade,
      postProcessNote: "규칙: 동일 사건 BEST 1건 제한",
    };
  });
}

function mergeReason(item: AiRecommendPostProcessOutput): string {
  if (!item.postProcessNote) return item.reason;
  const base = item.reason.trim();
  if (base.includes(item.postProcessNote)) return base;
  return `${base} (${item.postProcessNote})`;
}

/**
 * Post-process AI grades: sports/gossip demotion, then same-event BEST cap.
 * Does not promote grades; high-importance only blocks demotion.
 */
export function applyAiRecommendPostProcess(
  items: AiRecommendPostProcessInput[]
): AiRecommendPostProcessOutput[] {
  if (items.length === 0) return [];

  const afterSports = items.map((item) => applySportsGossipDemotion(item));
  const afterCluster = applySameEventBestCap(afterSports);

  return afterCluster.map((item) => ({
    ...item,
    reason: mergeReason(item),
  }));
}
