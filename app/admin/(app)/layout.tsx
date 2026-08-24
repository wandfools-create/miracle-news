import { supabase } from "@/lib/supabase";
import { countActionableCollectionCandidates, countShortlistedCollectionCandidates } from "@/lib/admin/fetchCollectionCandidates";
import AdminQuickNav from "@/components/admin/AdminQuickNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const [
    { count: reviewCount },
    { count: onHoldCount },
    { count: revisionCount },
    { count: approvedCount },
    { count: publishedCount },
    { count: rejectedCount },
    collectionCandidatesCount,
    collectionShortlistCount,
  ] = await Promise.all([
    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("status", "ready_for_human_review")
      .eq("review_status", "pending"),

    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("review_status", "on_hold"),

    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("review_status", "needs_revision")
      .eq("revision_status", "requested"),

    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("review_status", "approved")
      .eq("status", "approved")
      .eq("is_published", false),

    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("is_published", true)
      .eq("status", "published"),

    supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .eq("review_status", "rejected")
      .eq("status", "rejected"),

    countActionableCollectionCandidates(),
    countShortlistedCollectionCandidates(),
  ]);

  return (
    <>
      <AdminQuickNav
        userEmail={user?.email ?? null}
        counts={{
          review: reviewCount ?? 0,
          collectionCandidates: collectionCandidatesCount,
          collectionShortlist: collectionShortlistCount,
          onHold: onHoldCount ?? 0,
          revision: revisionCount ?? 0,
          approved: approvedCount ?? 0,
          published: publishedCount ?? 0,
          rejected: rejectedCount ?? 0,
        }}
      />
      {children}
    </>
  );
}
