import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import type { EditorialCollectionRule, EditorialRuleAction } from "./types";

type RuleRow = {
  id: string;
  name: string;
  action: EditorialRuleAction;
  keywords: string[] | null;
  content_description: string | null;
  source_key: string | null;
  priority: number | null;
  is_active: boolean | null;
};

function mapRule(row: RuleRow): EditorialCollectionRule {
  return {
    id: row.id,
    name: row.name,
    action: row.action,
    keywords: row.keywords ?? [],
    contentDescription: row.content_description,
    sourceKey: row.source_key,
    priority: row.priority ?? 0,
    isActive: row.is_active !== false,
  };
}

export async function fetchEditorialCollectionRules(options?: {
  activeOnly?: boolean;
}): Promise<{ rules: EditorialCollectionRule[]; schemaReady: boolean; error: string | null }> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    let query = client
      .from("editorial_collection_rules")
      .select("id, name, action, keywords, content_description, source_key, priority, is_active")
      .order("priority", { ascending: false });
    if (options?.activeOnly) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) {
      const unavailable = error.code === "42P01" || /does not exist/i.test(error.message);
      return { rules: [], schemaReady: !unavailable, error: unavailable ? null : error.message };
    }
    return { rules: (data as RuleRow[]).map(mapRule), schemaReady: true, error: null };
  } catch (error) {
    return { rules: [], schemaReady: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function saveEditorialCollectionRule(input: {
  id?: string;
  name: string;
  action: EditorialRuleAction;
  keywords: string[];
  contentDescription: string | null;
  sourceKey: string | null;
  priority: number;
  isActive: boolean;
  actor: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const payload = {
      name: input.name.slice(0, 120),
      action: input.action,
      keywords: input.keywords.slice(0, 50),
      content_description: input.contentDescription?.slice(0, 500) ?? null,
      source_key: input.sourceKey?.slice(0, 100) ?? null,
      priority: Math.max(0, Math.min(100, Math.trunc(input.priority))),
      is_active: input.isActive,
      updated_by: input.actor,
      updated_at: new Date().toISOString(),
    };
    const result = input.id
      ? await client.from("editorial_collection_rules").update(payload).eq("id", input.id)
      : await client.from("editorial_collection_rules").insert({ ...payload, created_by: input.actor });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteEditorialCollectionRule(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client.from("editorial_collection_rules").delete().eq("id", input.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function recordEditorialExclusion(input: {
  ruleId: string;
  source: string;
  originalUrl: string;
  title: string;
  reason: string;
  collectionRunId: string | null;
}): Promise<boolean> {
  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client.from("editorial_collection_audit").insert({
      rule_id: input.ruleId,
      source: input.source.slice(0, 100),
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
      .select("id, rule_id, source, original_url, title_excerpt, decision, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(200, limit)));
    if (error) return { rows: [], error: error.message };
    return { rows: data ?? [], error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}
