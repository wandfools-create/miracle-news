import "server-only";

import type {
  SameEventCandidateRow,
  SameEventPublishedRow,
} from "@/lib/same-event/sameEventDecide";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export {
  decideCollectSameEvent,
  evaluatePublishedSameEventGuard,
  type CollectSameEventDecision,
  type PublishedSameEventGuard,
  type SameEventCandidateRow,
  type SameEventPublishedRow,
} from "@/lib/same-event/sameEventDecide";
export { classifySameEvent } from "@/lib/same-event/classifySameEvent";

const CANDIDATE_LOOKBACK_HOURS = 72;
const PUBLISHED_LOOKBACK_DAYS = 7;

export async function loadRecentCandidatesForSameEvent(): Promise<
  SameEventCandidateRow[]
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return [];

  try {
    const { client } = createServiceRoleSupabaseClient();
    const since = new Date(
      Date.now() - CANDIDATE_LOOKBACK_HOURS * 3_600_000
    ).toISOString();
    const { data, error } = await client
      .from("collection_candidates")
      .select(
        "id, source, rss_title, rss_summary, rss_title_ko, rss_summary_ko, rss_published_at, thumbnail_url, created_at"
      )
      .gte("created_at", since)
      .not("status", "eq", "dismissed")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.warn("[same-event] load candidates failed", error.message);
      return [];
    }

    return (data ?? []).map((row) => {
      const r = row as {
        id: string;
        source: string;
        rss_title: string;
        rss_summary: string | null;
        rss_title_ko: string | null;
        rss_summary_ko: string | null;
        rss_published_at: string | null;
        thumbnail_url: string | null;
        created_at: string;
      };
      return {
        id: r.id,
        source: r.source,
        rss_title: r.rss_title,
        title: r.rss_title,
        summary: r.rss_summary,
        titleAlt: r.rss_title_ko,
        summaryAlt: r.rss_summary_ko,
        publishedAt: r.rss_published_at || r.created_at,
        hasThumbnail: Boolean(r.thumbnail_url?.trim()),
      };
    });
  } catch (err) {
    console.warn("[same-event] load candidates threw", err);
    return [];
  }
}

export async function loadRecentPublishedForSameEvent(): Promise<
  SameEventPublishedRow[]
> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return [];

  try {
    const { client } = createServiceRoleSupabaseClient();
    const since = new Date(
      Date.now() - PUBLISHED_LOOKBACK_DAYS * 86_400_000
    ).toISOString();
    const { data, error } = await client
      .from("articles")
      .select(
        "id, source, title_ko, title_original, summary_ko, summary_original, published_at, thumbnail_url"
      )
      .eq("is_published", true)
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(300);

    if (error) {
      console.warn("[same-event] load published failed", error.message);
      return [];
    }

    return (data ?? []).map((row) => {
      const r = row as {
        id: string;
        source: string;
        title_ko: string | null;
        title_original: string | null;
        summary_ko: string | null;
        summary_original: string | null;
        published_at: string | null;
        thumbnail_url: string | null;
      };
      const title = (r.title_ko || r.title_original || "").trim();
      return {
        id: r.id,
        source: r.source,
        title_ko: r.title_ko,
        title_original: r.title_original,
        title,
        summary: r.summary_ko || r.summary_original,
        titleAlt: r.title_original,
        summaryAlt: r.summary_original,
        publishedAt: r.published_at,
        published_at: r.published_at,
        hasThumbnail: Boolean(r.thumbnail_url?.trim()),
      };
    });
  } catch (err) {
    console.warn("[same-event] load published threw", err);
    return [];
  }
}
