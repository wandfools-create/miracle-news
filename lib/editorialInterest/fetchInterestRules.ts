import "server-only";

import {
  DEFAULT_EDITORIAL_INTEREST_RULES,
  type EditorialInterestRule,
} from "./rules";
import { supabase } from "@/lib/supabase";

type DbRuleRow = {
  id: string;
  name: string;
  keywords: string[] | null;
  content_description: string | null;
  countries: string[] | null;
  people: string[] | null;
  organizations: string[] | null;
  topics: string[] | null;
  exclude_topics: string[] | null;
  priority: number | null;
  is_active: boolean | null;
};

function mapRow(row: DbRuleRow): EditorialInterestRule {
  return {
    id: row.id,
    name: row.name,
    keywords: row.keywords ?? [],
    contentDescription: row.content_description,
    countries: row.countries ?? [],
    people: row.people ?? [],
    organizations: row.organizations ?? [],
    topics: row.topics ?? [],
    excludeTopics: row.exclude_topics ?? [],
    priority: row.priority ?? 0,
    isActive: row.is_active !== false,
  };
}

export async function fetchEditorialInterestRules(): Promise<EditorialInterestRule[]> {
  const { data, error } = await supabase
    .from("editorial_interest_rules")
    .select(
      "id, name, keywords, content_description, countries, people, organizations, topics, exclude_topics, priority, is_active"
    )
    .order("priority", { ascending: false });

  if (error || !data?.length) {
    return DEFAULT_EDITORIAL_INTEREST_RULES;
  }

  return (data as DbRuleRow[]).map(mapRow);
}

export async function upsertEditorialInterestRule(
  rule: Omit<EditorialInterestRule, "id"> & { id?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = {
    name: rule.name.trim(),
    keywords: rule.keywords,
    content_description: rule.contentDescription,
    countries: rule.countries,
    people: rule.people,
    organizations: rule.organizations,
    topics: rule.topics,
    exclude_topics: rule.excludeTopics,
    priority: rule.priority,
    is_active: rule.isActive,
    updated_at: new Date().toISOString(),
  };

  if (rule.id) {
    const { error } = await supabase
      .from("editorial_interest_rules")
      .update(payload)
      .eq("id", rule.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("editorial_interest_rules").insert(payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
