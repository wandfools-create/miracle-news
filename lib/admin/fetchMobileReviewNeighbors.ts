import "server-only";

import { supabase } from "@/lib/supabase";

export type MobileReviewNeighbors = {
  prevId: string | null;
  nextId: string | null;
  index: number;
  total: number;
};

/** Ordered pending-review queue for mobile prev/next navigation. */
export async function fetchMobileReviewNeighbors(
  articleId: string
): Promise<MobileReviewNeighbors> {
  const { data, error } = await supabase
    .from("articles")
    .select("id")
    .eq("review_status", "pending")
    .eq("status", "ready_for_human_review")
    .eq("is_published", false)
    .order("collected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error || !data?.length) {
    return { prevId: null, nextId: null, index: 0, total: 0 };
  }

  const ids = data.map((row) => row.id as string);
  const index = ids.indexOf(articleId);
  if (index < 0) {
    return {
      prevId: ids[0] ?? null,
      nextId: ids[1] ?? null,
      index: -1,
      total: ids.length,
    };
  }

  return {
    prevId: index > 0 ? ids[index - 1]! : null,
    nextId: index < ids.length - 1 ? ids[index + 1]! : null,
    index: index + 1,
    total: ids.length,
  };
}

export async function fetchFirstMobileReviewArticleId(): Promise<string | null> {
  const { data } = await supabase
    .from("articles")
    .select("id")
    .eq("review_status", "pending")
    .eq("status", "ready_for_human_review")
    .eq("is_published", false)
    .order("collected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

/**
 * After a successful publish, re-read the pending queue from the server.
 * Never trust a client-supplied nextArticleId for post-publish navigation.
 */
export async function fetchNextPendingReviewArticleIdAfterPublish(
  publishedArticleId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("articles")
    .select("id")
    .eq("review_status", "pending")
    .eq("status", "ready_for_human_review")
    .eq("is_published", false)
    .neq("id", publishedArticleId)
    .order("collected_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data?.id as string | undefined) ?? null;
}
