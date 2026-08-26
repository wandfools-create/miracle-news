"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  discardArticlesCore,
  restoreDiscardedArticleCore,
} from "@/lib/admin/discardArticlesCore";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DiscardArticlesActionResult = {
  ok: boolean;
  discardedCount: number;
  skippedCount: number;
  failedCount: number;
  discardedIds: string[];
  error?: string;
};

function revalidateDiscardPaths(articleIds: string[] = []) {
  revalidatePath("/admin/on-hold");
  revalidatePath("/admin/revision");
  revalidatePath("/admin/review");
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/archive");
  revalidatePath("/admin/quick-review");
  revalidatePath("/admin");
  for (const id of articleIds) {
    revalidatePath(`/admin/review/${id}`);
  }
}

function getReturnPath(from: string): string {
  if (from === "revision") return "/admin/revision";
  if (from === "archive") return "/admin/archive?tab=articles";
  return "/admin/on-hold";
}

function parseIdsFromFormData(formData: FormData): string[] {
  const fromMulti = formData
    .getAll("articleIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const fromCsv = String(formData.get("articleIdsCsv") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const single = String(formData.get("articleId") ?? "").trim();
  return [...new Set([...fromMulti, ...fromCsv, ...(single ? [single] : [])])];
}

async function requireAdmin(): Promise<
  { ok: true; email: string | null } | { ok: false; error: string }
> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) {
    return { ok: false, error: "관리자만 폐기할 수 있습니다." };
  }
  return { ok: true, email: user.email ?? null };
}

function redirectWithDiscardResult(
  returnPath: string,
  result: Awaited<ReturnType<typeof discardArticlesCore>>
): never {
  const params = new URLSearchParams();
  params.set("discarded", String(result.discardedCount));
  params.set(
    "skipped",
    String(result.skippedPublished + result.skippedOther)
  );
  params.set("failed", String(result.failedCount));
  if (!result.ok || result.discardedCount === 0) {
    params.set(
      "discardError",
      result.error || "폐기된 기사 0건 — DB가 변경되지 않았습니다."
    );
  } else if (result.error) {
    params.set("discardError", result.error);
  }
  redirect(`${returnPath}?${params.toString()}`);
}

/**
 * Form / formAction entry: soft-discard → archived via service role.
 * count=0 never counts as success.
 */
export async function discardArticlesAction(formData: FormData): Promise<void> {
  const from = String(formData.get("from") ?? "on_hold").trim();
  const returnPath = getReturnPath(from);

  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect(
      `${returnPath}?discarded=0&discardError=${encodeURIComponent(auth.error)}`
    );
  }

  const articleIds = parseIdsFromFormData(formData);
  const result = await discardArticlesCore(articleIds);

  if (result.discardedCount > 0) {
    revalidateDiscardPaths(result.discardedIds);
  }

  redirectWithDiscardResult(returnPath, result);
}

/**
 * Explicit-ID entry for client collectors (avoids external checkbox FormData bugs).
 * Returns a result object when `redirect=0`; otherwise redirects like the form action.
 */
export async function discardArticlesByIdsAction(
  formData: FormData
): Promise<DiscardArticlesActionResult | void> {
  const from = String(formData.get("from") ?? "on_hold").trim();
  const returnPath = getReturnPath(from);
  const wantRedirect = String(formData.get("redirect") ?? "1") !== "0";

  const auth = await requireAdmin();
  if (!auth.ok) {
    if (!wantRedirect) {
      return {
        ok: false,
        discardedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        discardedIds: [],
        error: auth.error,
      };
    }
    redirect(
      `${returnPath}?discarded=0&discardError=${encodeURIComponent(auth.error)}`
    );
  }

  const articleIds = parseIdsFromFormData(formData);
  const result = await discardArticlesCore(articleIds);

  if (result.discardedCount > 0) {
    revalidateDiscardPaths(result.discardedIds);
  }

  if (!wantRedirect) {
    return {
      ok: result.ok && result.discardedCount > 0,
      discardedCount: result.discardedCount,
      skippedCount: result.skippedPublished + result.skippedOther,
      failedCount: result.failedCount,
      discardedIds: result.discardedIds,
      error:
        result.discardedCount === 0
          ? result.error || "폐기된 기사 0건"
          : result.error,
    };
  }

  redirectWithDiscardResult(returnPath, result);
}

export async function restoreDiscardedArticleAction(
  formData: FormData
): Promise<void> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    redirect(
      `/admin/archive?tab=articles&restoreError=${encodeURIComponent(auth.error)}`
    );
  }

  const articleId = String(formData.get("articleId") ?? "").trim();
  const result = await restoreDiscardedArticleCore(articleId);
  if (!result.ok) {
    redirect(
      `/admin/archive?tab=articles&restoreError=${encodeURIComponent(result.error)}`
    );
  }

  revalidateDiscardPaths([result.articleId]);
  redirect("/admin/review?restored=1");
}
