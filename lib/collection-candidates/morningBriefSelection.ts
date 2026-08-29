import {
  compareCandidatesByAiRecommend,
  normalizeAiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";
import { applyAiRecommendPostProcess } from "@/lib/collection-candidates/candidateRecommendPostProcess";
import {
  detectEditorialBeat,
  describeViewpointAngle,
  homePolicyPoints,
  type EditorialBeat,
} from "@/lib/editorialPolicy/signals";
import type { MorningBriefItem } from "@/lib/discord/morningBriefMessage";
import type { CollectionCandidateRow } from "@/lib/collection-candidates/types";

const ACTIONABLE_STATUSES = ["pending", "enrich_failed", "enriching"] as const;

/** Pure eligibility check (DB query uses the same rules). */
export function isMorningBriefSendEligible(
  row: Pick<
    CollectionCandidateRow,
    "discord_brief_sent_at" | "ai_recommended_at" | "status"
  >
): boolean {
  if (!row.ai_recommended_at || row.discord_brief_sent_at) return false;
  return (ACTIONABLE_STATUSES as readonly string[]).includes(row.status);
}

function briefSectionRank(beat: EditorialBeat): number {
  switch (beat) {
    case "mega_event":
      return 0;
    case "us_politics_economy":
      return 1;
    case "kr_politics_economy":
      return 2;
    case "foreign_security":
      return 3;
    case "science_society_impact":
      return 4;
    case "general":
      return 5;
    case "soft_news":
      return 6;
  }
}

export function selectMorningBriefItemsFromRows(
  rows: CollectionCandidateRow[],
  /** Optional emergency throttle. Omit / null / Infinity = all eligible. */
  maxItems?: number | null
): MorningBriefItem[] {
  const withGrades = rows
    .map((row) => {
      const grade = normalizeAiRecommendGrade(row.ai_recommend_grade);
      if (!grade) return null;
      return {
        id: row.id,
        source: row.source,
        feedLabel: row.feed_label,
        title: row.rss_title,
        summary: row.rss_summary ?? "",
        originalUrl: row.original_url,
        rssPublishedAt: row.rss_published_at,
        aiRecommendGrade: grade,
        aiRecommendScore:
          typeof row.ai_recommend_score === "number"
            ? row.ai_recommend_score
            : null,
        aiRecommendReason: row.ai_recommend_reason,
        createdAt: row.created_at,
        category: row.category ?? null,
      };
    })
    .filter(Boolean) as Array<
    MorningBriefItem & {
      summary: string;
      createdAt: string;
      category: string | null;
      aiRecommendGrade: NonNullable<
        ReturnType<typeof normalizeAiRecommendGrade>
      >;
    }
  >;

  const postProcessed = applyAiRecommendPostProcess(
    withGrades.map((item) => ({
      id: item.id,
      grade: item.aiRecommendGrade,
      score: item.aiRecommendScore ?? 0,
      reason: item.aiRecommendReason ?? "",
      title: item.title,
      summary: item.summary,
      source: item.source,
      originalUrl: item.originalUrl,
      rssPublishedAt: item.rssPublishedAt,
      createdAt: item.createdAt,
    }))
  );

  const gradeById = new Map(postProcessed.map((p) => [p.id, p]));

  const filtered: MorningBriefItem[] = [];
  for (const item of withGrades) {
    const adjusted = gradeById.get(item.id);
    if (!adjusted) continue;
    const signal = {
      title: item.title,
      summary: item.summary,
      source: item.source,
      category: item.category,
    };
    const beat = detectEditorialBeat(signal);
    const angle = describeViewpointAngle(signal);
    const reasonParts = [adjusted.reason.trim()].filter(Boolean);
    if (angle) reasonParts.push(angle);

    filtered.push({
      id: item.id,
      source: item.source,
      feedLabel: item.feedLabel,
      title: item.title,
      originalUrl: item.originalUrl,
      rssPublishedAt: item.rssPublishedAt,
      aiRecommendGrade: adjusted.grade,
      aiRecommendScore: adjusted.score,
      aiRecommendReason: reasonParts.join(" · ") || null,
      editorialBeat: beat,
      viewpointNote: angle,
    });
  }

  filtered.sort((a, b) => {
    const beatDiff =
      briefSectionRank(a.editorialBeat ?? "general") -
      briefSectionRank(b.editorialBeat ?? "general");
    if (beatDiff !== 0) return beatDiff;

    const policyDiff =
      homePolicyPoints({
        title: b.title,
        source: b.source,
      }) -
      homePolicyPoints({
        title: a.title,
        source: a.source,
      });
    if (policyDiff !== 0) return policyDiff;

    return compareCandidatesByAiRecommend(
      {
        aiRecommendGrade: a.aiRecommendGrade,
        rssPublishedAt: a.rssPublishedAt,
      },
      {
        aiRecommendGrade: b.aiRecommendGrade,
        rssPublishedAt: b.rssPublishedAt,
      }
    );
  });

  if (
    typeof maxItems === "number" &&
    Number.isFinite(maxItems) &&
    maxItems > 0 &&
    maxItems !== Number.POSITIVE_INFINITY
  ) {
    return filtered.slice(0, Math.floor(maxItems));
  }
  return filtered;
}
