"use server";

import { revalidateAdminNavCountsCache } from "@/lib/admin/revalidateAdminNav";
import { revalidatePath } from "next/cache";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import {
  dismissCollectionCandidatesBulk,
  expireCollectionCandidatesBulk,
} from "@/lib/collection-candidates/bulkCandidateOps";
import { dismissCollectionCandidate } from "@/lib/collection-candidates/dismissCollectionCandidate";
import { shortlistCollectionCandidates } from "@/lib/collection-candidates/shortlistOps";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DeskMutationResult =
  | { ok: true; action: "dismiss" | "shortlist" | "expire"; ids: string[]; count: number }
  | { ok: false; error: string; step?: string };

async function requireAdmin(): Promise<
  | { ok: true; email: string | null }
  | { ok: false; error: string; step: "auth" }
> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) {
    return { ok: false, error: "관리자만 실행할 수 있습니다.", step: "auth" };
  }
  return { ok: true, email: user.email ?? null };
}

/** Shortlist page only — avoid revalidating the open candidates list (scroll jump). */
function revalidateShortlistPage() {
  revalidateAdminNavCountsCache();
  revalidatePath("/admin/collection-shortlist");
}

/** Single/bulk dismiss — returns updated ids. No redirect. No OpenAI. */
export async function deskDismissCandidatesAction(
  candidateIds: string[]
): Promise<DeskMutationResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, error: "제외할 후보가 없습니다.", step: "validation" };
  }

  if (ids.length === 1) {
    const result = await dismissCollectionCandidate({
      candidateId: ids[0]!,
      dismissedBy: admin.email,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, step: "dismiss" };
    }
    return { ok: true, action: "dismiss", ids, count: 1 };
  }

  const result = await dismissCollectionCandidatesBulk({
    candidateIds: ids,
    dismissedBy: admin.email,
  });
  if (!result.ok) {
    return { ok: false, error: result.error, step: "dismiss_bulk" };
  }
  if (result.count === 0) {
    return {
      ok: false,
      error: "제외할 수 있는 후보가 없습니다. 상태·권한을 확인하세요.",
      step: "dismiss_bulk",
    };
  }
  return {
    ok: true,
    action: "dismiss",
    ids: result.ids,
    count: result.count,
  };
}

/** Single/bulk shortlist — returns updated ids. No redirect. No OpenAI. */
export async function deskShortlistCandidatesAction(
  candidateIds: string[]
): Promise<DeskMutationResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const result = await shortlistCollectionCandidates({
    candidateIds,
    shortlistedBy: admin.email,
  });
  if (!result.ok) {
    return { ok: false, error: result.error, step: "shortlist" };
  }
  if (result.count === 0) {
    return {
      ok: false,
      error:
        "보관함에 담을 수 있는 후보가 없습니다. 이미 선정됐거나 기사 연결된 항목일 수 있습니다.",
      step: "shortlist",
    };
  }
  revalidateShortlistPage();
  return {
    ok: true,
    action: "shortlist",
    ids: result.ids,
    count: result.count,
  };
}

/** Bulk expire — returns updated ids. No redirect. No OpenAI. */
export async function deskExpireCandidatesAction(
  candidateIds: string[]
): Promise<DeskMutationResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const result = await expireCollectionCandidatesBulk({ candidateIds });
  if (!result.ok) {
    return { ok: false, error: result.error, step: "expire" };
  }
  if (result.count === 0) {
    return {
      ok: false,
      error: "만료 처리할 수 있는 후보가 없습니다.",
      step: "expire",
    };
  }
  return {
    ok: true,
    action: "expire",
    ids: result.ids,
    count: result.count,
  };
}
