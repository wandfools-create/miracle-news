"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { archiveStaleRejectedArticles } from "@/lib/admin/cleanup/archiveStaleRejectedArticles";
import { archiveStaleReviewArticles } from "@/lib/admin/cleanup/archiveStaleReviewArticles";
import { expireStaleCollectionCandidates } from "@/lib/admin/cleanup/expireStaleCollectionCandidates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; reason: "auth" }
> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) {
    return { ok: false, reason: "auth" };
  }
  return { ok: true };
}

function revalidateCleanupPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/cleanup");
  revalidatePath("/admin/archive");
  revalidatePath("/admin/collection-candidates");
  revalidatePath("/admin/review");
  revalidatePath("/admin/rejected");
}

/** Explicit confirm required: form must include confirm=1. */
export async function expireStaleCandidatesAction(formData: FormData) {
  const confirmed = String(formData.get("confirm") ?? "").trim() === "1";
  if (!confirmed) {
    redirect("/admin/cleanup?error=confirm");
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect("/admin/cleanup?error=auth");
  }

  const result = await expireStaleCollectionCandidates();
  revalidateCleanupPaths();

  if (!result.ok) {
    redirect(
      `/admin/cleanup?error=expire&detail=${encodeURIComponent(result.error)}`
    );
  }

  redirect(`/admin/cleanup?expired=${result.expiredCount}`);
}

export async function archiveStaleReviewArticlesAction(formData: FormData) {
  const confirmed = String(formData.get("confirm") ?? "").trim() === "1";
  if (!confirmed) {
    redirect("/admin/cleanup?error=confirm");
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect("/admin/cleanup?error=auth");
  }

  const result = await archiveStaleReviewArticles();
  revalidateCleanupPaths();

  if (!result.ok) {
    redirect(
      `/admin/cleanup?error=archive&detail=${encodeURIComponent(result.error)}`
    );
  }

  redirect(`/admin/cleanup?archived=${result.archivedCount}`);
}

export async function archiveStaleRejectedArticlesAction(formData: FormData) {
  const confirmed = String(formData.get("confirm") ?? "").trim() === "1";
  if (!confirmed) {
    redirect("/admin/cleanup?error=confirm");
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect("/admin/cleanup?error=auth");
  }

  const result = await archiveStaleRejectedArticles();
  revalidateCleanupPaths();

  if (!result.ok) {
    redirect(
      `/admin/cleanup?error=rejected&detail=${encodeURIComponent(result.error)}`
    );
  }

  redirect(`/admin/cleanup?rejectedArchived=${result.archivedCount}`);
}
