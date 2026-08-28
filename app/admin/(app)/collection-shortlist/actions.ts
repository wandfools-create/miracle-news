"use server";

import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import { unshortlistCollectionCandidates } from "@/lib/collection-candidates/shortlistOps";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function shortlistPath(extra?: Record<string, string>) {
  const params = new URLSearchParams();
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }
  }
  const q = params.toString();
  return q ? `/admin/collection-shortlist?${q}` : "/admin/collection-shortlist";
}

async function requireAdmin() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) return null;
  return user;
}

function readIds(formData: FormData): string[] {
  const single = String(formData.get("candidateId") ?? "").trim();
  const many = formData
    .getAll("candidateIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (single) return [single, ...many];
  return many;
}

function revalidateShortlistQueues(extraPaths: string[] = []) {
  revalidateAdminNavCountsCache();
  revalidatePath("/admin/collection-shortlist");
  for (const p of extraPaths) revalidatePath(p);
}

/** Remove from shortlist → pending. No OpenAI. */
export async function unshortlistFromShortlistAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) redirect(shortlistPath({ error: "auth" }));

  const result = await unshortlistCollectionCandidates({
    candidateIds: readIds(formData),
  });

  revalidateShortlistQueues();

  if (!result.ok) redirect(shortlistPath({ error: "1" }));
  redirect(shortlistPath({ restored: String(result.count) }));
}

/** Dismiss from shortlist. No OpenAI. */
export async function dismissFromShortlistAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) redirect(shortlistPath({ error: "auth" }));

  const ids = readIds(formData);
  if (ids.length === 0) redirect(shortlistPath({ error: "missing" }));

  let ok = 0;
  for (const candidateId of ids) {
    const result = await dismissCollectionCandidate({
      candidateId,
      dismissedBy: user.email ?? null,
    });
    if (result.ok) ok += 1;
  }

  revalidateShortlistQueues();
  redirect(shortlistPath({ dismissed: String(ok) }));
}

/** Enrich from shortlist page — OpenAI via promote. */
export async function enrichFromShortlistAction(
  _prev: { ok: false; error: string; step?: string; categoryLabel?: string } | null,
  formData: FormData
): Promise<{ ok: false; error: string; step?: string; categoryLabel?: string } | null> {
  const candidateId = String(formData.get("candidateId") ?? "").trim();
  if (!candidateId) {
    return { ok: false, error: "후보 ID가 없습니다." };
  }

  const user = await requireAdmin();
  if (!user) {
    return { ok: false, error: "관리자만 기사를 만들 수 있습니다." };
  }

  const { promoteCollectionCandidate } = await import(
    "@/lib/collection-candidates/promoteCollectionCandidate"
  );
  const {
    readAdminForceCreateFromFormData,
    readManualBodyFromFormData,
  } = await import("@/lib/from-link/adminManualPromote");

  const result = await promoteCollectionCandidate({
    candidateId,
    selectedBy: user.email ?? null,
    supplementalText: readManualBodyFromFormData(formData),
    adminForceCreate: readAdminForceCreateFromFormData(formData),
  });

  if (!result.ok) {
    revalidateShortlistQueues();
    return {
      ok: false,
      error: result.error,
      step: result.step,
      categoryLabel: result.categoryLabel,
    };
  }

  revalidateShortlistQueues([
    "/admin/review",
    `/admin/review/${result.articleId}`,
  ]);
  redirect(shortlistPath({ made: result.articleId }));
}
