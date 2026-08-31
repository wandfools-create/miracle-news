import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/serviceRole";
import { checkSupabaseServiceEnvWithDns } from "@/lib/supabase/serviceRole";
import type { DuplicateAngleClass } from "./duplicateAngleTypes";

export async function recordDuplicateAngleOverride(input: {
  actor: string;
  action: string;
  candidateId?: string | null;
  articleId?: string | null;
  matchedArticleId?: string | null;
  originalUrl?: string | null;
  source?: string | null;
  classification: DuplicateAngleClass;
  overrideReason: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return;

  const { client } = createServiceRoleSupabaseClient();
  await client.from("duplicate_angle_overrides").insert({
    actor: input.actor,
    action: input.action,
    candidate_id: input.candidateId ?? null,
    article_id: input.articleId ?? null,
    matched_article_id: input.matchedArticleId ?? null,
    original_url: input.originalUrl ?? null,
    source: input.source ?? null,
    classification: input.classification,
    override_reason: input.overrideReason.slice(0, 2000),
    metadata: input.metadata ?? {},
  });
}
