"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { upsertEditorialInterestRule } from "@/lib/editorialInterest/fetchInterestRules";

function parseList(value: FormDataEntryValue | null): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function saveEditorialInterestRuleFromForm(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim() || undefined;
  const result = await upsertEditorialInterestRule({
    id,
    name: String(formData.get("name") ?? "").trim() || "새 기준",
    keywords: parseList(formData.get("keywords")),
    contentDescription:
      String(formData.get("contentDescription") ?? "").trim() || null,
    countries: parseList(formData.get("countries")),
    people: parseList(formData.get("people")),
    organizations: parseList(formData.get("organizations")),
    topics: parseList(formData.get("topics")),
    excludeTopics: parseList(formData.get("excludeTopics")),
    priority: Number(formData.get("priority") ?? 0) || 0,
    isActive: String(formData.get("isActive") ?? "") === "on",
  });

  if (!result.ok) {
    redirect(
      `/admin/editorial-interest?error=${encodeURIComponent(result.error)}`
    );
  }

  revalidatePath("/admin/editorial-interest");
  revalidatePath("/admin/collection-candidates");
  redirect("/admin/editorial-interest?saved=1");
}
