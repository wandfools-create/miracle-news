import AdminQuickNav from "@/components/admin/AdminQuickNav";
import { getAdminNavCounts } from "@/lib/admin/adminNavCounts";
import { readAdminSessionEmailFromCookies } from "@/lib/admin/readAdminSessionEmail";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [counts, userEmail] = await Promise.all([
    getAdminNavCounts(),
    readAdminSessionEmailFromCookies(),
  ]);

  return (
    <>
      <AdminQuickNav
        userEmail={userEmail}
        counts={{
          review: counts.review,
          quickReview: counts.quickReview,
          collectionCandidates: counts.collectionCandidates,
          collectionShortlist: counts.collectionShortlist,
          onHold: counts.onHold,
          revision: counts.revision,
          approved: counts.approved,
          published: counts.published,
          rejected: counts.rejected,
        }}
      />
      {children}
    </>
  );
}
