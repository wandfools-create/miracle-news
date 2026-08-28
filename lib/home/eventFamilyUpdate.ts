/**
 * Event-family leadership: meaningful UPDATE beats older grades inside one family.
 * Runs before overall home editorial ranking. No OpenAI.
 */
import { getEditorialFreshnessTimestamp } from "./articleFreshness";
import {
  isDistinctEventAngle,
  normalizeEventFamilyKey,
  normalizeTopicClusterKey,
} from "./topicClusterKey";
import type { HomeArticleCard } from "./types";

export type EventFamilyRole =
  | "standalone"
  | "update"
  | "background"
  | "different_angle";

export type EventLifecycleStage =
  | "outcome_result"
  | "official_toll"
  | "active_crisis"
  | "analysis_angle"
  | "trivial_followup"
  | "unknown";

function articleKey(article: HomeArticleCard): string {
  return article.article_id ?? article.id;
}

function textOf(article: HomeArticleCard): string {
  return `${article.title || ""}\n${article.summary || ""}\n${article.topic_key || ""}\n${article.topic_label || ""}`;
}

const TRIVIAL_FOLLOWUP =
  /\b(hints?\s+at|may\s+consider|watching|rumor|speculation|unnamed\s+source)\b/i;

/** Outcome / status-change language (meaningful UPDATE). */
const OUTCOME_RESULT =
  /\b(evacuat(?:ed|ion)?|rescued|saved|recovered|found\s+alive|safely\s+moved|deal\s+reached|agreement\s+reached|collapsed|broke\s+down|passed|defeated|indicted|convicted|verdict|implemented|takes?\s+effect)\b/i;

const OUTCOME_RESULT_KO =
  /(안전하게\s*이송|이송\s*완료|이송|구조\s*됐|구조됨|구조\s*완료|구조\s*성공|발견\s*됐|타결|결렬|통과|부결|기소|판결|시행)/;

/** Official casualty / toll updates. */
const OFFICIAL_TOLL =
  /\b(death\s+toll|casualties\s+rise|confirmed\s+dead|official\s+(death|toll|figure))\b/i;
const OFFICIAL_TOLL_KO = /(사망자\s*(갱신|발표|집계)|공식\s*피해|사망\s*Toll|사망\s*\d+)/i;

/** Still-unfolding crisis (missing / stranded / talks ongoing). */
const ACTIVE_CRISIS =
  /\b(missing|stranded|trapped|isolated|negotiat|talks\s+continue|search\s+for)\b/i;
const ACTIVE_CRISIS_KO = /(실종|고립|갇혀|협상\s*중|수색)/;

/** Cause / climate / analysis — DIFFERENT ANGLE, not a status UPDATE. */
const ANALYSIS_ANGLE =
  /\b(glacier|climate|warming|cause|analysts?\s+say|why\s+the)\b/i;
const ANALYSIS_ANGLE_KO = /(빙하|온난화|기후|원인\s*분석|배경\s*분석)/;

/**
 * Crisis markers without a resolution verb stay active_crisis
 * even if the blurb mentions rescue authorities (구조 당국).
 */
function hasUnresolvedCrisis(text: string): boolean {
  const crisis = ACTIVE_CRISIS.test(text) || ACTIVE_CRISIS_KO.test(text);
  if (!crisis) return false;
  const resolved =
    OUTCOME_RESULT.test(text) ||
    OUTCOME_RESULT_KO.test(text) ||
    /\b(evacuat|rescued|safely\s+moved)\b/i.test(text) ||
    /(안전하게\s*이송|이송\s*완료|구조\s*됐|구조됨|구조\s*완료)/.test(text);
  return !resolved;
}

export function detectEventLifecycleStage(
  article: Pick<HomeArticleCard, "title" | "summary" | "topic_key" | "topic_label">
): EventLifecycleStage {
  const text = textOf(article as HomeArticleCard);
  if (TRIVIAL_FOLLOWUP.test(text) && !OUTCOME_RESULT.test(text) && !OUTCOME_RESULT_KO.test(text)) {
    return "trivial_followup";
  }
  // Climate / cause analysis is DIFFERENT ANGLE — do not collapse into crisis.
  if (
    (ANALYSIS_ANGLE.test(text) || ANALYSIS_ANGLE_KO.test(text)) &&
    !(OUTCOME_RESULT.test(text) || OUTCOME_RESULT_KO.test(text))
  ) {
    return "analysis_angle";
  }
  // Prefer unresolved crisis over weak "rescue authorities" false positives.
  if (hasUnresolvedCrisis(text)) {
    return "active_crisis";
  }
  if (OUTCOME_RESULT.test(text) || OUTCOME_RESULT_KO.test(text)) {
    return "outcome_result";
  }
  if (OFFICIAL_TOLL.test(text) || OFFICIAL_TOLL_KO.test(text)) {
    return "official_toll";
  }
  if (ACTIVE_CRISIS.test(text) || ACTIVE_CRISIS_KO.test(text)) {
    return "active_crisis";
  }
  return "unknown";
}

/** Higher = more advanced status for representative selection. */
export function lifecycleRank(stage: EventLifecycleStage): number {
  switch (stage) {
    case "outcome_result":
      return 50;
    case "official_toll":
      return 40;
    case "active_crisis":
      return 30;
    case "analysis_angle":
      return 20;
    case "unknown":
      return 10;
    case "trivial_followup":
      return 0;
  }
}

/**
 * True when `newer` is a meaningful status UPDATE relative to `older`
 * (not a mere rewrite, not a different analysis angle).
 */
export function isMeaningfulEventUpdate(
  newer: HomeArticleCard,
  older: HomeArticleCard
): boolean {
  const familyN = normalizeEventFamilyKey({
    topic_key: newer.topic_key,
    topic_label: newer.topic_label,
    title: newer.title,
  });
  const familyO = normalizeEventFamilyKey({
    topic_key: older.topic_key,
    topic_label: older.topic_label,
    title: older.title,
  });
  if (!familyN || familyN !== familyO) return false;

  const tsN = getEditorialFreshnessTimestamp(newer);
  const tsO = getEditorialFreshnessTimestamp(older);
  if (tsN > 0 && tsO > 0 && tsN < tsO) return false;

  const stageN = detectEventLifecycleStage(newer);
  const stageO = detectEventLifecycleStage(older);

  if (stageN === "trivial_followup") return false;
  if (stageN === "analysis_angle" && stageO !== "analysis_angle") {
    // Analysis is DIFFERENT ANGLE, not an UPDATE that supersedes crisis/outcome.
    return false;
  }
  if (stageO === "analysis_angle" && stageN !== "analysis_angle") {
    // Outcome/crisis does not "update away" a distinct analysis angle.
    return false;
  }

  if (lifecycleRank(stageN) > lifecycleRank(stageO)) return true;

  // Same stage: newer official numbers / more complete wording can still be UPDATE
  // only when titles clearly differ (not a near-duplicate rewrite).
  if (stageN === stageO && stageN !== "unknown") {
    const clusterN = normalizeTopicClusterKey({
      topic_key: newer.topic_key,
      topic_label: newer.topic_label,
      title: newer.title,
    });
    const clusterO = normalizeTopicClusterKey({
      topic_key: older.topic_key,
      topic_label: older.topic_label,
      title: older.title,
    });
    if (clusterN && clusterO && clusterN === clusterO) return false;
    if (tsN > tsO + 6 * 3600_000) return true;
  }

  return false;
}

function completeness(article: HomeArticleCard): number {
  return (
    (article.title?.trim().length ?? 0) + (article.summary?.trim().length ?? 0)
  );
}

function gradeRank(article: HomeArticleCard): number {
  switch (article.ai_recommend_grade) {
    case "best":
      return 4;
    case "priority":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

/**
 * Pick the family representative. Meaningful UPDATE / advanced lifecycle
 * outranks older AI best. Trivial follow-ups never win.
 */
export function pickEventFamilyRepresentative(
  cluster: HomeArticleCard[]
): HomeArticleCard {
  if (cluster.length === 1) return cluster[0]!;

  const scored = [...cluster].map((article) => {
    const stage = detectEventLifecycleStage(article);
    const ts = getEditorialFreshnessTimestamp(article);
    return {
      article,
      stage,
      stageRank: lifecycleRank(stage),
      ts,
      grade: gradeRank(article),
      complete: completeness(article),
    };
  });

  scored.sort((a, b) => {
    // Meaningful newer UPDATE vs older: prefer higher lifecycle first.
    if (a.stageRank !== b.stageRank) return b.stageRank - a.stageRank;

    // Same lifecycle: newer wins.
    if (a.ts !== b.ts) return b.ts - a.ts;

    // Then completeness, then grade as weak tie-break only.
    if (a.complete !== b.complete) return b.complete - a.complete;
    if (a.grade !== b.grade) return b.grade - a.grade;
    return articleKey(a.article).localeCompare(articleKey(b.article));
  });

  return scored[0]!.article;
}

export type EventFamilyLeadership = {
  /** Keys that may compete for featured / primary slots. */
  leaderKeys: Set<string>;
  /** Superseded same-family stories (background). */
  backgroundKeys: Set<string>;
  /** Different-angle peers kept eligible under family caps. */
  angleKeys: Set<string>;
  roleByKey: Map<string, EventFamilyRole>;
  /** For score inheritance: leader key → best AI grade among siblings. */
  inheritedGradeByLeader: Map<string, HomeArticleCard["ai_recommend_grade"]>;
};

function familyOf(article: HomeArticleCard): string | null {
  return normalizeEventFamilyKey({
    topic_key: article.topic_key,
    topic_label: article.topic_label,
    title: article.title,
  });
}

/**
 * Resolve leadership inside each event family before home ranking.
 */
export function resolveEventFamilyLeadership(
  articles: HomeArticleCard[]
): EventFamilyLeadership {
  const leaderKeys = new Set<string>();
  const backgroundKeys = new Set<string>();
  const angleKeys = new Set<string>();
  const roleByKey = new Map<string, EventFamilyRole>();
  const inheritedGradeByLeader = new Map<
    string,
    HomeArticleCard["ai_recommend_grade"]
  >();

  const byFamily = new Map<string, HomeArticleCard[]>();
  const unfamilied: HomeArticleCard[] = [];

  for (const article of articles) {
    const family = familyOf(article);
    if (!family) {
      unfamilied.push(article);
      continue;
    }
    const list = byFamily.get(family) ?? [];
    list.push(article);
    byFamily.set(family, list);
  }

  for (const article of unfamilied) {
    const key = articleKey(article);
    leaderKeys.add(key);
    roleByKey.set(key, "standalone");
  }

  for (const [, cluster] of byFamily) {
    const leader = pickEventFamilyRepresentative(cluster);
    const leaderKey = articleKey(leader);
    leaderKeys.add(leaderKey);

    let bestGrade = leader.ai_recommend_grade ?? null;
    for (const sibling of cluster) {
      if (gradeRank(sibling) > gradeRank({ ai_recommend_grade: bestGrade } as HomeArticleCard)) {
        bestGrade = sibling.ai_recommend_grade ?? bestGrade;
      }
    }
    inheritedGradeByLeader.set(leaderKey, bestGrade);

    const leaderStage = detectEventLifecycleStage(leader);
    if (leaderStage === "outcome_result" || leaderStage === "official_toll") {
      roleByKey.set(leaderKey, cluster.length > 1 ? "update" : "standalone");
    } else {
      roleByKey.set(leaderKey, "standalone");
    }

    for (const sibling of cluster) {
      const key = articleKey(sibling);
      if (key === leaderKey) continue;

      const distinct = isDistinctEventAngle(
        {
          topic_key: sibling.topic_key,
          topic_label: sibling.topic_label,
          title: sibling.title,
        },
        [
          {
            topic_key: leader.topic_key,
            topic_label: leader.topic_label,
            title: leader.title,
          },
        ]
      );

      const siblingStage = detectEventLifecycleStage(sibling);
      const meaningful = isMeaningfulEventUpdate(leader, sibling);

      // Analysis angle that is distinct stays eligible (DIFFERENT ANGLE).
      if (
        distinct &&
        siblingStage === "analysis_angle" &&
        leaderStage !== "analysis_angle"
      ) {
        angleKeys.add(key);
        leaderKeys.add(key);
        roleByKey.set(key, "different_angle");
        continue;
      }

      // Superseded crisis/status story → background only.
      if (meaningful || lifecycleRank(siblingStage) < lifecycleRank(leaderStage)) {
        backgroundKeys.add(key);
        roleByKey.set(key, "background");
        continue;
      }

      if (distinct) {
        angleKeys.add(key);
        leaderKeys.add(key);
        roleByKey.set(key, "different_angle");
      } else {
        backgroundKeys.add(key);
        roleByKey.set(key, "background");
      }
    }
  }

  return {
    leaderKeys,
    backgroundKeys,
    angleKeys,
    roleByKey,
    inheritedGradeByLeader,
  };
}

/**
 * Articles eligible for featured / primary rails (excludes superseded backgrounds).
 * Backgrounds remain in the full pool for related/context slots.
 */
export function filterEventFamilyLeaders(
  articles: HomeArticleCard[]
): HomeArticleCard[] {
  const { leaderKeys, backgroundKeys } = resolveEventFamilyLeadership(articles);
  return articles.filter((a) => {
    const key = articleKey(a);
    if (backgroundKeys.has(key)) return false;
    return leaderKeys.has(key);
  });
}

/**
 * Apply inherited AI grade onto family leaders so a meaningful UPDATE
 * can compete with an older sibling that held `best`.
 */
export function withInheritedEventFamilyGrades(
  articles: HomeArticleCard[]
): HomeArticleCard[] {
  const leadership = resolveEventFamilyLeadership(articles);
  return articles.map((article) => {
    const key = articleKey(article);
    if (!leadership.leaderKeys.has(key)) return article;
    if (leadership.backgroundKeys.has(key)) return article;
    const inherited = leadership.inheritedGradeByLeader.get(key);
    if (!inherited) return article;
    if (gradeRank({ ai_recommend_grade: inherited } as HomeArticleCard) <= gradeRank(article)) {
      return article;
    }
    return {
      ...article,
      ai_recommend_grade: inherited,
    };
  });
}

export function getEventFamilyRole(
  article: HomeArticleCard,
  leadership: EventFamilyLeadership
): EventFamilyRole {
  return leadership.roleByKey.get(articleKey(article)) ?? "standalone";
}
