"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { parseCandidateCategoryFilter } from "@/lib/collection-candidates/candidateCategory";
import {
  dismissCollectionCandidatesBulk,
  expireCollectionCandidatesBulk,
} from "@/lib/collection-candidates/bulkCandidateOps";
import { candidateListSearchParams } from "@/lib/collection-candidates/candidateListQuery";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BulkCandidateActionState =
  | { ok: true; count: number; action: "dismiss" | "expire" | "enrich" }
  | { ok: false; error: string; step?: string }
  | null;

function listPathFromForm(formData: FormData, extra?: Record<string, string>) {
  const params = new URLSearchParams(
    candidateListSearchParams({
      status: String(formData.get("statusFilter") ?? "").trim() || "actionable",
      source: String(formData.get("sourceFilter") ?? "").trim() || "all",
      date: String(formData.get("dateFilter") ?? "").trim() || "all",
      category: parseCandidateCategoryFilter(
        String(formData.get("categoryFilter") ?? "")
      ),
    })
  );
  const advanced = String(formData.get("advanced") ?? "").trim();
  if (advanced === "1") params.set("advanced", "1");
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      params.set(key, value);
    }
  }
  return `/admin/collection-candidates?${params.toString()}`;
}

function readIds(formData: FormData): string[] {
  return formData
    .getAll("candidateIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

async function requireAdmin() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) {
    return null;
  }
  return user;
}

/** Bulk dismiss — no OpenAI. */
export async function bulkDismissCandidatesAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) {
    redirect(listPathFromForm(formData, { dismissError: "auth" }));
  }

  const result = await dismissCollectionCandidatesBulk({
    candidateIds: readIds(formData),
    dismissedBy: user.email ?? null,
  });

  revalidatePath("/admin/collection-candidates");

  if (!result.ok) {
    redirect(listPathFromForm(formData, { dismissError: "1" }));
  }

  redirect(listPathFromForm(formData, { dismissed: String(result.count) }));
}

/** Bulk expire/archive — no OpenAI. */
export async function bulkExpireCandidatesAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) {
    redirect(listPathFromForm(formData, { dismissError: "auth" }));
  }

  const result = await expireCollectionCandidatesBulk({
    candidateIds: readIds(formData),
  });

  revalidatePath("/admin/collection-candidates");

  if (!result.ok) {
    redirect(listPathFromForm(formData, { dismissError: "1" }));
  }

  redirect(listPathFromForm(formData, { expired: String(result.count) }));
}

/**
 * Bulk 「기사 만들기」 — OpenAI per candidate (sequential).
 * Confirm dialog must run on the client before submit.
 */
export async function bulkEnrichCandidatesAction(formData: FormData) {
  const user = await requireAdmin();
  if (!user) {
    redirect(listPathFromForm(formData, { dismissError: "auth" }));
  }

  const ids = readIds(formData);
  if (ids.length === 0) {
    redirect(listPathFromForm(formData, { dismissError: "missing" }));
  }

  const { promoteCollectionCandidate } = await import(
    "@/lib/collection-candidates/promoteCollectionCandidate"
  );

  let made = 0;
  let lastArticleId: string | null = null;
  for (const candidateId of ids) {
    const result = await promoteCollectionCandidate({
      candidateId,
      selectedBy: user.email ?? null,
    });
    if (result.ok) {
      made += 1;
      lastArticleId = result.articleId;
    }
  }

  revalidatePath("/admin/collection-candidates");
  revalidatePath("/admin/review");
  if (lastArticleId) {
    revalidatePath(`/admin/review/${lastArticleId}`);
  }

  const extra: Record<string, string> = { bulkMade: String(made) };
  if (lastArticleId) extra.made = lastArticleId;
  redirect(listPathFromForm(formData, extra));
}
