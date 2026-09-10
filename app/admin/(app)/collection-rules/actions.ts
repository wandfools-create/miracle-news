"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import {
  deleteEditorialCollectionRule,
  saveEditorialCollectionRule,
} from "@/lib/editorial-rules/editorialRuleStore";
import type { EditorialRuleAction } from "@/lib/editorial-rules/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireRuleAdmin(): Promise<string> {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user || !isAllowedAdminEmail(data.user.email)) redirect("/admin/login");
  return data.user.email ?? "admin";
}

function list(value: FormDataEntryValue | null): string[] {
  return [...new Set(String(value ?? "").split(/[,;\n]/).map((v) => v.trim()).filter(Boolean))];
}

function collectionRulesUrl(key: "saved" | "deleted" | "error", value = "1") {
  return `/admin/collection-rules?${key}=${encodeURIComponent(value)}`;
}

export async function saveCollectionRuleAction(formData: FormData) {
  const actor = await requireRuleAdmin();
  const actionValue = String(formData.get("action") ?? "review");
  const action: EditorialRuleAction =
    actionValue === "exclude" || actionValue === "prioritize" ? actionValue : "review";
  const result = await saveEditorialCollectionRule({
    id: String(formData.get("id") ?? "").trim() || undefined,
    name: String(formData.get("name") ?? "").trim() || "새 수집 기준",
    action,
    keywords: list(formData.get("keywords")),
    contentDescription: String(formData.get("contentDescription") ?? "").trim() || null,
    sourceKey: String(formData.get("sourceKey") ?? "").trim() || null,
    priority: Number(formData.get("priority") ?? 50),
    isActive: formData.get("isActive") === "on",
    actor,
  });
  if (!result.ok) redirect(collectionRulesUrl("error", "save_failed"));
  revalidatePath("/admin/collection-rules");
  redirect(collectionRulesUrl("saved"));
}

export async function deleteCollectionRuleAction(formData: FormData) {
  await requireRuleAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect(collectionRulesUrl("error", "missing_rule"));
  const result = await deleteEditorialCollectionRule({ id });
  if (!result.ok) redirect(collectionRulesUrl("error", "delete_failed"));
  revalidatePath("/admin/collection-rules");
  redirect(collectionRulesUrl("deleted"));
}
