import "server-only";

import { inferCandidateCollectRegion } from "@/lib/collection-candidates/groupCandidatesByRun";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import type { CollectRegion } from "@/lib/rss/collectRegions";

export type PreviewCandidateRow = {
  id: string;
  title: string;
  summary: string | null;
  sourceKey: string;
  categories: string[];
  collectRegion: CollectRegion | null;
};

/** Recent candidates for read-only rule preview (max 100). No mutations. */
export async function fetchCandidatesForEditorialPreview(
  limit = 100
): Promise<{ rows: PreviewCandidateRow[]; error: string | null }> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const { data, error } = await client
      .from("collection_candidates")
      .select(
        "id, source, source_country, rss_title, rss_title_ko, rss_summary, rss_summary_ko, category, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)));
    if (error) return { rows: [], error: error.message };

    const rows: PreviewCandidateRow[] = (data ?? []).map((row) => {
      const sourceKey = String(row.source ?? "").trim();
      const title =
        String(row.rss_title_ko ?? "").trim() ||
        String(row.rss_title ?? "").trim() ||
        "(제목 없음)";
      const summary =
        String(row.rss_summary_ko ?? "").trim() ||
        String(row.rss_summary ?? "").trim() ||
        null;
      const category = String(row.category ?? "").trim();
      return {
        id: String(row.id),
        title,
        summary,
        sourceKey,
        categories: category ? [category] : [],
        collectRegion: inferCandidateCollectRegion({
          source: sourceKey,
          source_country: row.source_country as string | null,
        }),
      };
    });
    return { rows, error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
