import {
  compareCandidatesByAiRecommend,
  normalizeAiRecommendGrade,
} from "@/lib/collection-candidates/candidateRecommend";
import { applyAiRecommendPostProcess } from "@/lib/collection-candidates/candidateRecommendPostProcess";
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

export function selectMorningBriefItemsFromRows(
  rows: CollectionCandidateRow[],
  maxItems: number
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
      };
    })
    .filter(Boolean) as Array<
    MorningBriefItem & {
      summary: string;
      createdAt: string;
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
    if (adjusted.grade !== "best" && adjusted.grade !== "priority") continue;
    filtered.push({
      id: item.id,
      source: item.source,
      feedLabel: item.feedLabel,
      title: item.title,
      originalUrl: item.originalUrl,
      rssPublishedAt: item.rssPublishedAt,
      aiRecommendGrade: adjusted.grade,
      aiRecommendScore: adjusted.score,
      aiRecommendReason: adjusted.reason,
    });
  }

  filtered.sort((a, b) =>
    compareCandidatesByAiRecommend(
      {
        aiRecommendGrade: a.aiRecommendGrade,
        rssPublishedAt: a.rssPublishedAt,
      },
      {
        aiRecommendGrade: b.aiRecommendGrade,
        rssPublishedAt: b.rssPublishedAt,
      }
    )
  );

  return filtered.slice(0, maxItems);
}
