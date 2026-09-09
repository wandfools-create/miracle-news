"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import {
  deactivateEditorialCollectionRule,
  saveEditorialCollectionRule,
  setEditorialCollectionRuleActive,
} from "@/lib/editorial-rules/editorialRuleStore";
import type {
  EditorialRuleAction,
  EditorialRuleKind,
  EditorialRuleRegion,
} from "@/lib/editorial-rules/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false }
> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) return { ok: false };
  return { ok: true, email: user.email ?? "admin" };
}

function parseAction(value: string): EditorialRuleAction {
  if (
    value === "always_keep" ||
    value === "prioritize" ||
    value === "review" ||
    value === "exclude"
  ) {
    return value;
  }
  return "review";
}

function parseKind(value: string): EditorialRuleKind {
  if (value === "keyword" || value === "category" || value === "source") {
    return value;
  }
  return "keyword";
}

function parseRegion(value: string): EditorialRuleRegion {
  if (value === "korea" || value === "us-intl" || value === "all") return value;
  return "all";
}

function revalidateRules() {
  revalidatePath("/admin/collection-rules");
}

export async function saveCollectionRuleAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login?next=/admin/collection-rules");

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const result = await saveEditorialCollectionRule({
    id,
    name: String(formData.get("name") ?? ""),
    kind: parseKind(String(formData.get("kind") ?? "keyword")),
    action: parseAction(String(formData.get("action") ?? "review")),
    keywordsRaw: String(formData.get("keywords") ?? ""),
    category: String(formData.get("category") ?? "").trim() || null,
    sourceKey: String(formData.get("sourceKey") ?? "").trim() || null,
    region: parseRegion(String(formData.get("region") ?? "all")),
    priority: Number(formData.get("priority") ?? 50),
    isActive: String(formData.get("isActive") ?? "") === "1",
    adminNote: String(formData.get("adminNote") ?? "").trim() || null,
    confirmSourceWideExclude:
      String(formData.get("confirmSourceWideExclude") ?? "") === "1",
    actor: auth.email,
  });

  revalidateRules();
  if (!result.ok) {
    redirect(
      `/admin/collection-rules?error=${encodeURIComponent(result.error.slice(0, 180))}`
    );
  }
  redirect("/admin/collection-rules?saved=1");
}

export async function deactivateCollectionRuleAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login?next=/admin/collection-rules");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin/collection-rules?error=missing");

  const result = await deactivateEditorialCollectionRule({
    id,
    actor: auth.email,
  });
  revalidateRules();
  if (!result.ok) {
    redirect(
      `/admin/collection-rules?error=${encodeURIComponent(result.error.slice(0, 180))}`
    );
  }
  redirect("/admin/collection-rules?deactivated=1");
}

export async function toggleCollectionRuleActiveAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login?next=/admin/collection-rules");

  const id = String(formData.get("id") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "") === "1";
  if (!id) redirect("/admin/collection-rules?error=missing");

  const result = await setEditorialCollectionRuleActive({
    id,
    isActive,
    actor: auth.email,
  });
  revalidateRules();
  if (!result.ok) {
    redirect(
      `/admin/collection-rules?error=${encodeURIComponent(result.error.slice(0, 180))}`
    );
  }
  redirect("/admin/collection-rules?saved=1");
}
