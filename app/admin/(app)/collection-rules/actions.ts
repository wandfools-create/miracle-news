"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { saveCollectionFieldProfile } from "@/lib/editorial-rules/collectionProfileStore";
import {
  deactivateEditorialCollectionRule,
  saveEditorialCollectionRule,
  setEditorialCollectionRuleActive,
} from "@/lib/editorial-rules/editorialRuleStore";
import type { CollectionFieldRealm } from "@/lib/editorial-rules/fieldTaxonomy";
import type { CollectionRegionScope } from "@/lib/editorial-rules/fieldTaxonomy";
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

function revalidateRules() {
  revalidatePath("/admin/collection-rules");
}

function parseRegionScope(value: string): CollectionRegionScope {
  if (
    value === "all" ||
    value === "korea" ||
    value === "us" ||
    value === "intl"
  ) {
    return value;
  }
  return "all";
}

function parseRealm(value: string): CollectionFieldRealm {
  if (
    value === "politics" ||
    value === "economy" ||
    value === "society" ||
    value === "public_health" ||
    value === "culture" ||
    value === "science" ||
    value === "lifestyle"
  ) {
    return value;
  }
  return "lifestyle";
}

/** Primary save: field checkboxes + countries + unclassified toggle. */
export async function saveCollectionFieldProfileAction(formData: FormData) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login?next=/admin/collection-rules");

  const enabledFieldIds = formData
    .getAll("enabledFieldIds")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const fieldIds = formData
    .getAll("fieldId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const fieldKeywords: Record<
    string,
    { collectRaw: string; excludeRaw: string }
  > = {};
  for (const id of fieldIds) {
    fieldKeywords[id] = {
      collectRaw: String(formData.get(`collectKeywords:${id}`) ?? ""),
      excludeRaw: String(formData.get(`excludeKeywords:${id}`) ?? ""),
    };
  }

  const customFields: Array<{
    id?: string;
    realm: CollectionFieldRealm;
    labelKo: string;
    enabled: boolean;
    collectRaw: string;
    excludeRaw: string;
    delete?: boolean;
  }> = [];

  const customIds = formData
    .getAll("customFieldId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  for (const id of customIds) {
    customFields.push({
      id,
      realm: parseRealm(String(formData.get(`customRealm:${id}`) ?? "")),
      labelKo: String(formData.get(`customLabel:${id}`) ?? ""),
      enabled: enabledFieldIds.includes(id),
      collectRaw: String(formData.get(`collectKeywords:${id}`) ?? ""),
      excludeRaw: String(formData.get(`excludeKeywords:${id}`) ?? ""),
      delete: String(formData.get(`deleteCustom:${id}`) ?? "") === "1",
    });
  }

  // New custom field (one per save from "세부 분야 추가")
  const newLabel = String(formData.get("newCustomLabel") ?? "").trim();
  if (newLabel) {
    customFields.push({
      realm: parseRealm(String(formData.get("newCustomRealm") ?? "")),
      labelKo: newLabel,
      enabled: true,
      collectRaw: String(formData.get("newCustomCollect") ?? ""),
      excludeRaw: String(formData.get("newCustomExclude") ?? ""),
    });
  }

  const countries: Array<{
    iso: string;
    nameKo: string;
    enabled: boolean;
    collectRaw: string;
    excludeRaw: string;
    delete?: boolean;
  }> = [];

  const countryIsos = formData
    .getAll("countryIso")
    .map((v) => String(v).trim().toUpperCase())
    .filter(Boolean);
  for (const iso of countryIsos) {
    countries.push({
      iso,
      nameKo: String(formData.get(`countryName:${iso}`) ?? iso),
      enabled: String(formData.get(`countryEnabled:${iso}`) ?? "") === "1",
      collectRaw: String(formData.get(`countryCollect:${iso}`) ?? ""),
      excludeRaw: String(formData.get(`countryExclude:${iso}`) ?? ""),
      delete: String(formData.get(`deleteCountry:${iso}`) ?? "") === "1",
    });
  }

  const newIso = String(formData.get("newCountryIso") ?? "")
    .trim()
    .toUpperCase();
  if (newIso) {
    countries.push({
      iso: newIso,
      nameKo: String(formData.get("newCountryName") ?? newIso).trim() || newIso,
      enabled: true,
      collectRaw: String(formData.get("newCountryCollect") ?? ""),
      excludeRaw: String(formData.get("newCountryExclude") ?? ""),
    });
  }

  const result = await saveCollectionFieldProfile({
    acceptUnclassified:
      String(formData.get("acceptUnclassified") ?? "") === "1",
    regionScope: parseRegionScope(String(formData.get("regionScope") ?? "all")),
    enabledFieldIds,
    fieldKeywords,
    customFields,
    countries,
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

/** Advanced (collapsed) free-rule editor — keeps existing engine. */
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
  redirect("/admin/collection-rules?saved=1&advanced=1");
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
  redirect("/admin/collection-rules?deactivated=1&advanced=1");
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
  redirect("/admin/collection-rules?saved=1&advanced=1");
}
