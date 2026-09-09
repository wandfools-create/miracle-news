import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import {
  validateEditorialRuleInput,
  type EditorialRuleValidationInput,
} from "./editorialRuleValidation";
import type {
  EditorialCollectionRule,
  EditorialRuleAction,
  EditorialRuleKind,
  EditorialRuleRegion,
} from "./types";

type RuleRow = {
  id: string;
  name: string;
  kind: string;
  action: string;
  keywords: string[] | null;
  category: string | null;
  source_key: string | null;
  region: string | null;
  priority: number | null;
  is_active: boolean | null;
  is_system: boolean | null;
  admin_note: string | null;
};

function asAction(value: string): EditorialRuleAction {
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

function asKind(value: string): EditorialRuleKind {
  if (value === "keyword" || value === "category" || value === "source") {
    return value;
  }
  return "keyword";
}

function asRegion(value: string | null): EditorialRuleRegion {
  if (value === "korea" || value === "us-intl" || value === "all") return value;
  return "all";
}

function mapRule(row: RuleRow): EditorialCollectionRule {
  return {
    id: row.id,
    name: row.name,
    kind: asKind(row.kind),
    action: asAction(row.action),
    keywords: row.keywords ?? [],
    category: row.category,
    sourceKey: row.source_key,
    region: asRegion(row.region),
    priority: row.priority ?? 50,
    isActive: row.is_active !== false,
    isSystem: row.is_system === true,
    adminNote: row.admin_note,
  };
}

function isMissingRelation(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist/i.test(error.message ?? "") ||
    /could not find the table/i.test(error.message ?? "")
  );
}

export async function fetchEditorialCollectionRules(options?: {
  activeOnly?: boolean;
}): Promise<{
  rules: EditorialCollectionRule[];
  schemaReady: boolean;
  error: string | null;
}> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    let query = client
      .from("editorial_collection_rules")
      .select(
        "id, name, kind, action, keywords, category, source_key, region, priority, is_active, is_system, admin_note"
      )
      .order("priority", { ascending: false })
      .order("name", { ascending: true });
    if (options?.activeOnly) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) {
      if (isMissingRelation(error)) {
        return { rules: [], schemaReady: false, error: null };
      }
      return { rules: [], schemaReady: true, error: error.message };
    }
    return {
      rules: (data as RuleRow[]).map(mapRule),
      schemaReady: true,
      error: null,
    };
  } catch (error) {
    return {
      rules: [],
      schemaReady: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type SaveEditorialRuleInput = EditorialRuleValidationInput & {
  actor: string;
};

export async function saveEditorialCollectionRule(
  input: SaveEditorialRuleInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const existingResult = await fetchEditorialCollectionRules();
    if (!existingResult.schemaReady) {
      return {
        ok: false,
        error: "규칙 테이블이 아직 없습니다. migration 적용 후 저장하세요.",
      };
    }
    if (existingResult.error) {
      return { ok: false, error: existingResult.error };
    }

    const validated = validateEditorialRuleInput(input, existingResult.rules);
    if (!validated.ok) return validated;

    const { client } = createServiceRoleSupabaseClient();
    const payload = {
      name: input.name.trim().slice(0, 120),
      kind: input.kind,
      action: input.action,
      keywords: validated.keywords.slice(0, 80),
      category: input.category?.trim().slice(0, 80) || null,
      source_key: input.sourceKey?.trim().slice(0, 100) || null,
      region: input.region,
      priority: Math.max(0, Math.min(100, Math.trunc(input.priority))),
      is_active: input.isActive,
      admin_note: input.adminNote?.trim().slice(0, 500) || null,
      updated_by: input.actor.slice(0, 200),
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await client
        .from("editorial_collection_rules")
        .update(payload)
        .eq("id", input.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const { error } = await client.from("editorial_collection_rules").insert({
      ...payload,
      is_system: false,
      is_active: false, // new user rules default inactive
      created_by: input.actor.slice(0, 200),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Soft-disable instead of delete. */
export async function deactivateEditorialCollectionRule(input: {
  id: string;
  actor: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client
      .from("editorial_collection_rules")
      .update({
        is_active: false,
        updated_by: input.actor.slice(0, 200),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);
    if (error) {
      if (isMissingRelation(error)) {
        return { ok: false, error: "규칙 테이블이 없습니다." };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function setEditorialCollectionRuleActive(input: {
  id: string;
  isActive: boolean;
  actor: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client
      .from("editorial_collection_rules")
      .update({
        is_active: input.isActive,
        updated_by: input.actor.slice(0, 200),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function recordEditorialExclusion(input: {
  ruleId: string;
  ruleName: string;
  source: string;
  region: string | null;
  originalUrl: string;
  title: string;
  reason: string;
  collectionRunId: string | null;
}): Promise<boolean> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client.from("editorial_collection_audit").insert({
      rule_id: input.ruleId,
      rule_name: input.ruleName.slice(0, 120),
      source: input.source.slice(0, 100),
      region: input.region?.slice(0, 32) ?? null,
      original_url: input.originalUrl.slice(0, 2000),
      title_excerpt: input.title.slice(0, 300),
      decision: "excluded",
      reason: input.reason.slice(0, 500),
      collection_run_id: input.collectionRunId,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchRecentEditorialAudit(limit = 100) {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const { data, error } = await client
      .from("editorial_collection_audit")
      .select(
        "id, rule_id, rule_name, source, region, original_url, title_excerpt, decision, reason, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(200, limit)));
    if (error) {
      if (isMissingRelation(error)) return { rows: [], error: null };
      return { rows: [], error: error.message };
    }
    return { rows: data ?? [], error: null };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
