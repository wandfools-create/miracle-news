import "server-only";

import {
  categorizeEnrichFailure,
  formatRssEnrichFailureNote,
  type RssEnrichFailureCategory,
} from "@/lib/rss/enrichFailure";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export async function logRssCollectItemFailure(input: {
  sourceLabel: string;
  originalUrl: string;
  rssTitle?: string | null;
  step: string;
  error: string;
  category?: RssEnrichFailureCategory;
  categoryLabel?: string;
  extractDetail?: string | null;
  persistLogs?: boolean;
  onDbWrite?: () => void;
}): Promise<void> {
  if (input.persistLogs === false) return;
  const classified = input.category
    ? {
        category: input.category,
        categoryLabel:
          input.categoryLabel ??
          categorizeEnrichFailure(input.step, input.error).categoryLabel,
      }
    : categorizeEnrichFailure(input.step, input.error);

  const note = [
    "rss collect v3 · not saved to review queue",
    formatRssEnrichFailureNote({
      categoryLabel: classified.categoryLabel,
      step: input.step,
      error: input.error,
    }),
    input.extractDetail ?? null,
    input.rssTitle ? `RSS 제목: ${input.rssTitle.trim()}` : null,
    `URL: ${input.originalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  console.warn("[collectRss] item skipped (enrich failed)", {
    source: input.sourceLabel,
    category: classified.category,
    categoryLabel: classified.categoryLabel,
    step: input.step,
    error: input.error,
    originalUrl: input.originalUrl,
  });

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return;

  try {
    const { client } = createServiceRoleSupabaseClient();
    await client.from("collection_logs").insert({
      source: input.sourceLabel,
      checked_count: 1,
      saved_count: 0,
      duplicate_count: 0,
      failed_count: 1,
      status: "failed",
      note,
    });
    input.onDbWrite?.();
  } catch (err) {
    console.error("[collectRss] collection_logs item failure write failed", err);
  }
}

export async function logRssCollectItemSkipped(input: {
  sourceLabel: string;
  originalUrl: string;
  rssTitle?: string | null;
  reason: string;
  persistLogs?: boolean;
  onDbWrite?: () => void;
}): Promise<void> {
  if (input.persistLogs === false) return;
  const note = [
    "rss collect v3 · prefilter skipped",
    `reason: ${input.reason}`,
    input.rssTitle ? `RSS 제목: ${input.rssTitle.trim()}` : null,
    `URL: ${input.originalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  console.info("[collectRss] item skipped (non-article prefilter)", {
    source: input.sourceLabel,
    reason: input.reason,
    originalUrl: input.originalUrl,
    rssTitle: input.rssTitle,
  });

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return;

  try {
    const { client } = createServiceRoleSupabaseClient();
    const { error } = await client.from("collection_logs").insert({
      source: input.sourceLabel,
      checked_count: 1,
      saved_count: 0,
      duplicate_count: 0,
      failed_count: 0,
      status: "success",
      note,
    });
    if (error) {
      console.error("[collectRss] collection_logs item skip write failed", error);
    } else {
      input.onDbWrite?.();
    }
  } catch (err) {
    console.error("[collectRss] collection_logs item skip write failed", err);
  }
}
