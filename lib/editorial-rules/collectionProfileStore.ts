import "server-only";

import type {
  CollectionCountryConfig,
  CollectionFieldConfig,
  CollectionFieldProfile,
} from "@/lib/editorial-rules/collectionProfileTypes";
import { buildDefaultCollectionFieldProfile } from "@/lib/editorial-rules/evaluateCollectionFieldProfile";
import {
  BUILT_IN_COLLECTION_FIELDS,
  COLLECTION_REALM_ORDER,
  type CollectionFieldRealm,
  type CollectionRegionScope,
} from "@/lib/editorial-rules/fieldTaxonomy";
import { parseKeywordList } from "@/lib/editorial-rules/matchKeywords";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

function isMissingRelation(error: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  const code = (error.code ?? "").trim();
  if (code === "42P01" || code === "PGRST205") return true;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    blob.includes("editorial_collection_profile") &&
    (blob.includes("does not exist") ||
      blob.includes("could not find") ||
      blob.includes("schema cache"))
  );
}

type FieldSettingRow = {
  enabled?: boolean;
  collectKeywords?: string[];
  excludeKeywords?: string[];
  labelKo?: string;
  realm?: CollectionFieldRealm;
  isCustom?: boolean;
  deletedAt?: string | null;
};

function parseRegionScope(value: unknown): CollectionRegionScope {
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, 80);
}

function hydrateFields(
  settings: Record<string, FieldSettingRow>
): CollectionFieldConfig[] {
  const fields: CollectionFieldConfig[] = BUILT_IN_COLLECTION_FIELDS.map(
    (builtIn) => {
      const row = settings[builtIn.id] ?? {};
      return {
        id: builtIn.id,
        realm: builtIn.realm,
        labelKo: builtIn.labelKo,
        enabled:
          typeof row.enabled === "boolean"
            ? row.enabled
            : builtIn.defaultEnabled,
        isCustom: false,
        collectKeywords: row.collectKeywords?.length
          ? asStringArray(row.collectKeywords)
          : [...builtIn.collectKeywords],
        excludeKeywords: row.excludeKeywords?.length
          ? asStringArray(row.excludeKeywords)
          : [...builtIn.excludeKeywords],
        deletedAt: null,
      };
    }
  );

  for (const [id, row] of Object.entries(settings)) {
    if (fields.some((f) => f.id === id)) continue;
    if (!row?.isCustom) continue;
    const realm = COLLECTION_REALM_ORDER.includes(row.realm as CollectionFieldRealm)
      ? (row.realm as CollectionFieldRealm)
      : "lifestyle";
    fields.push({
      id,
      realm,
      labelKo: String(row.labelKo ?? id).slice(0, 80),
      enabled: row.enabled !== false && !row.deletedAt,
      isCustom: true,
      collectKeywords: asStringArray(row.collectKeywords),
      excludeKeywords: asStringArray(row.excludeKeywords),
      deletedAt: row.deletedAt ? String(row.deletedAt) : null,
    });
  }

  return fields;
}

function hydrateCountries(raw: unknown): CollectionCountryConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: CollectionCountryConfig[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const iso = String(r.iso ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 2);
    if (!/^[A-Z]{2}$/.test(iso)) continue;
    out.push({
      iso,
      nameKo: String(r.nameKo ?? iso).trim().slice(0, 80) || iso,
      enabled: r.enabled !== false && !r.deletedAt,
      collectKeywords: asStringArray(r.collectKeywords),
      excludeKeywords: asStringArray(r.excludeKeywords),
      deletedAt: r.deletedAt ? String(r.deletedAt) : null,
    });
  }
  return out;
}

export async function fetchCollectionFieldProfile(): Promise<{
  profile: CollectionFieldProfile;
  error: string | null;
}> {
  const defaults = buildDefaultCollectionFieldProfile(false);
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { profile: defaults, error: envCheck.error };
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { data, error } = await client
      .from("editorial_collection_profile")
      .select(
        "accept_unclassified, region_scope, field_settings, countries, updated_at, updated_by"
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error)) {
        return { profile: defaults, error: null };
      }
      return { profile: defaults, error: error.message };
    }
    if (!data) {
      return {
        profile: buildDefaultCollectionFieldProfile(true),
        error: null,
      };
    }

    const settings =
      data.field_settings && typeof data.field_settings === "object"
        ? (data.field_settings as Record<string, FieldSettingRow>)
        : {};

    return {
      profile: {
        acceptUnclassified: Boolean(data.accept_unclassified),
        regionScope: parseRegionScope(data.region_scope),
        fields: hydrateFields(settings),
        countries: hydrateCountries(data.countries),
        updatedAt: data.updated_at ?? null,
        updatedBy: data.updated_by ?? null,
        schemaReady: true,
      },
      error: null,
    };
  } catch (err) {
    return {
      profile: defaults,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type SaveCollectionFieldProfileInput = {
  acceptUnclassified: boolean;
  regionScope: CollectionRegionScope;
  /** Checked field ids (built-in + custom not deleted). */
  enabledFieldIds: string[];
  /** Optional keyword overrides keyed by field id. */
  fieldKeywords: Record<
    string,
    { collectRaw: string; excludeRaw: string }
  >;
  customFields: Array<{
    id?: string;
    realm: CollectionFieldRealm;
    labelKo: string;
    enabled: boolean;
    collectRaw: string;
    excludeRaw: string;
    delete?: boolean;
  }>;
  countries: Array<{
    iso: string;
    nameKo: string;
    enabled: boolean;
    collectRaw: string;
    excludeRaw: string;
    delete?: boolean;
  }>;
  actor: string;
};

function customFieldId(realm: CollectionFieldRealm, labelKo: string): string {
  const slug = labelKo
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `custom.${realm}.${slug || "field"}.${Date.now().toString(36)}`;
}

export async function saveCollectionFieldProfile(
  input: SaveCollectionFieldProfileInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return { ok: false, error: envCheck.error };

  const enabledSet = new Set(input.enabledFieldIds);
  const fieldSettings: Record<string, FieldSettingRow> = {};

  for (const builtIn of BUILT_IN_COLLECTION_FIELDS) {
    const kw = input.fieldKeywords[builtIn.id];
    fieldSettings[builtIn.id] = {
      enabled: enabledSet.has(builtIn.id),
      isCustom: false,
      collectKeywords: kw
        ? parseKeywordList(kw.collectRaw)
        : [...builtIn.collectKeywords],
      excludeKeywords: kw
        ? parseKeywordList(kw.excludeRaw)
        : [...builtIn.excludeKeywords],
    };
  }

  const { profile: existing } = await fetchCollectionFieldProfile();
  for (const prev of existing.fields.filter((f) => f.isCustom)) {
    const update = input.customFields.find(
      (c) => c.id === prev.id || c.labelKo === prev.labelKo
    );
    if (update?.delete) {
      fieldSettings[prev.id] = {
        enabled: false,
        isCustom: true,
        labelKo: prev.labelKo,
        realm: prev.realm,
        collectKeywords: prev.collectKeywords,
        excludeKeywords: prev.excludeKeywords,
        deletedAt: new Date().toISOString(),
      };
      continue;
    }
    if (update) {
      fieldSettings[prev.id] = {
        enabled: update.enabled && enabledSet.has(prev.id),
        isCustom: true,
        labelKo: update.labelKo.trim().slice(0, 80) || prev.labelKo,
        realm: update.realm,
        collectKeywords: parseKeywordList(update.collectRaw),
        excludeKeywords: parseKeywordList(update.excludeRaw),
        deletedAt: null,
      };
      continue;
    }
    if (!prev.deletedAt) {
      fieldSettings[prev.id] = {
        enabled: enabledSet.has(prev.id),
        isCustom: true,
        labelKo: prev.labelKo,
        realm: prev.realm,
        collectKeywords: prev.collectKeywords,
        excludeKeywords: prev.excludeKeywords,
        deletedAt: null,
      };
    } else {
      fieldSettings[prev.id] = {
        enabled: false,
        isCustom: true,
        labelKo: prev.labelKo,
        realm: prev.realm,
        collectKeywords: prev.collectKeywords,
        excludeKeywords: prev.excludeKeywords,
        deletedAt: prev.deletedAt,
      };
    }
  }

  for (const custom of input.customFields) {
    if (custom.id || custom.delete) continue;
    const label = custom.labelKo.trim().slice(0, 80);
    if (!label) continue;
    const id = customFieldId(custom.realm, label);
    fieldSettings[id] = {
      enabled: custom.enabled,
      isCustom: true,
      labelKo: label,
      realm: custom.realm,
      collectKeywords: parseKeywordList(custom.collectRaw),
      excludeKeywords: parseKeywordList(custom.excludeRaw),
      deletedAt: null,
    };
  }

  const countries: CollectionCountryConfig[] = [];
  const seenIso = new Set<string>();
  for (const c of input.countries) {
    const iso = c.iso.trim().toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(iso)) {
      return { ok: false, error: `국가 코드가 올바르지 않습니다: ${c.iso}` };
    }
    if (seenIso.has(iso) && !c.delete) {
      return { ok: false, error: `국가 코드 중복: ${iso}` };
    }
    seenIso.add(iso);
    countries.push({
      iso,
      nameKo: c.nameKo.trim().slice(0, 80) || iso,
      enabled: c.enabled && !c.delete,
      collectKeywords: parseKeywordList(c.collectRaw),
      excludeKeywords: parseKeywordList(c.excludeRaw),
      deletedAt: c.delete ? new Date().toISOString() : null,
    });
  }

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client.from("editorial_collection_profile").upsert(
      {
        id: 1,
        accept_unclassified: input.acceptUnclassified,
        region_scope: input.regionScope,
        field_settings: fieldSettings,
        countries,
        updated_by: input.actor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) {
      if (isMissingRelation(error)) {
        return {
          ok: false,
          error:
            "분야 프로필 테이블이 없습니다. migrations/20260910_editorial_collection_field_profile.sql 적용이 필요합니다.",
        };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
