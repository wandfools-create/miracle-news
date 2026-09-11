import "server-only";

import { chatCompletionJson } from "@/lib/openai/chatCompletionJson";
import {
  checkOpenAiEnv,
  getOpenAiCandidateModel,
} from "@/lib/openai/env";
import { NEWS_WIRE_INCLUDE_STATUSES } from "@/lib/news-wire/types";
import {
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
  titleHasHangul,
  trimTitle,
} from "@/lib/news-wire/wireTitles";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export const WIRE_LOCALIZE_BATCH_SIZE = 40;
export const WIRE_LOCALIZE_MAX_PER_COLLECT = 100;

const SYSTEM_PROMPT =
  "You are a news headline translator. Output JSON only: " +
  '{"items":[{"id":string,"title_ko":string,"title_en":string}]}.\n' +
  "Rules:\n" +
  "- Translate each RSS headline only (never article body).\n" +
  "- Provide natural Korean in title_ko and natural English in title_en.\n" +
  "- Keep names, numbers, and proper nouns accurate.\n" +
  "- Do not invent facts. Return one object per input id.";

type WireLocalizeRow = {
  id: string;
  rss_title: string;
  rss_title_ko: string | null;
  rss_title_en: string | null;
  wire_titles_ready_at: string | null;
};

export type LocalizeWireTitlesResult =
  | {
      ok: true;
      scanned: number;
      needing: number;
      updated: number;
      openaiCalls: number;
      skippedReady: number;
      schemaReady: boolean;
    }
  | {
      ok: false;
      error: string;
      step: string;
      openaiCalls: number;
      schemaReady: boolean;
    };

function isMissingWireColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  const blob = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    blob.includes("rss_title_en") ||
    blob.includes("wire_titles_ready_at") ||
    blob.includes("42703")
  );
}

function needsLocalization(row: WireLocalizeRow): boolean {
  return !isWireTitlesReady(row);
}

/**
 * Title-only KO/EN localization for public News Wire.
 * Safe to call after RSS collect. Never throws to caller when wrapped.
 * Does not run on page requests.
 */
export async function localizeWireCandidateTitles(options?: {
  limit?: number;
  candidateIds?: string[];
}): Promise<LocalizeWireTitlesResult> {
  const limit = Math.min(
    WIRE_LOCALIZE_MAX_PER_COLLECT,
    Math.max(1, options?.limit ?? WIRE_LOCALIZE_BATCH_SIZE)
  );

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      ok: false,
      error: envCheck.error,
      step: envCheck.step,
      openaiCalls: 0,
      schemaReady: false,
    };
  }

  const { client } = createServiceRoleSupabaseClient();

  let query = client
    .from("collection_candidates")
    .select("id, rss_title, rss_title_ko, rss_title_en, wire_titles_ready_at")
    .in("status", NEWS_WIRE_INCLUDE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(Math.min(200, limit * 3));

  if (options?.candidateIds?.length) {
    query = client
      .from("collection_candidates")
      .select("id, rss_title, rss_title_ko, rss_title_en, wire_titles_ready_at")
      .in("id", options.candidateIds.slice(0, limit));
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingWireColumn(error)) {
      return {
        ok: true,
        scanned: 0,
        needing: 0,
        updated: 0,
        openaiCalls: 0,
        skippedReady: 0,
        schemaReady: false,
      };
    }
    return {
      ok: false,
      error: error.message,
      step: "fetch",
      openaiCalls: 0,
      schemaReady: true,
    };
  }

  const rows = (data ?? []) as WireLocalizeRow[];
  const needing = rows.filter(needsLocalization).slice(0, limit);
  const skippedReady = rows.length - needing.length;

  if (needing.length === 0) {
    return {
      ok: true,
      scanned: rows.length,
      needing: 0,
      updated: 0,
      openaiCalls: 0,
      skippedReady,
      schemaReady: true,
    };
  }

  // Fill native-language sides without OpenAI when possible.
  let updatedWithoutAi = 0;
  const stillNeedModel: WireLocalizeRow[] = [];
  for (const row of needing) {
    if (isWireKoTitleReady(row) && isWireEnTitleReady(row)) {
      const { error: readyErr } = await client
        .from("collection_candidates")
        .update({ wire_titles_ready_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("wire_titles_ready_at", null);
      if (!readyErr) updatedWithoutAi += 1;
      continue;
    }
    stillNeedModel.push(row);
  }

  if (stillNeedModel.length === 0) {
    return {
      ok: true,
      scanned: rows.length,
      needing: needing.length,
      updated: updatedWithoutAi,
      openaiCalls: 0,
      skippedReady,
      schemaReady: true,
    };
  }

  const openAi = checkOpenAiEnv();
  if (!openAi.ok) {
    return {
      ok: false,
      error: openAi.error,
      step: openAi.step,
      openaiCalls: 0,
      schemaReady: true,
    };
  }

  const payload = stillNeedModel.map((row) => ({
    id: row.id,
    title: row.rss_title,
    need_ko: !isWireKoTitleReady(row),
    need_en: !isWireEnTitleReady(row),
  }));

  const completion = await chatCompletionJson<{
    items?: Array<{ id?: unknown; title_ko?: unknown; title_en?: unknown }>;
  }>({
    step: "news_wire_title_localize",
    model: getOpenAiCandidateModel(),
    system: SYSTEM_PROMPT,
    user: JSON.stringify({ items: payload }),
    temperature: 0.2,
  });

  if (!completion.ok) {
    return {
      ok: false,
      error: completion.error,
      step: completion.step || "openai",
      openaiCalls: 1,
      schemaReady: true,
    };
  }

  const byId = new Map(
    stillNeedModel.map((row) => [row.id, row] as const)
  );
  let updated = updatedWithoutAi;
  for (const item of completion.data.items ?? []) {
    const id = String(item.id ?? "").trim();
    const row = byId.get(id);
    if (!row) continue;
    const titleKo = trimTitle(String(item.title_ko ?? ""));
    const titleEn = trimTitle(String(item.title_en ?? ""));
    const nextKo = isWireKoTitleReady(row)
      ? trimTitle(row.rss_title_ko) || null
      : titleKo || null;
    const nextEn = isWireEnTitleReady(row)
      ? trimTitle(row.rss_title_en) || null
      : titleEn || null;

    const ready =
      (Boolean(nextKo) || isWireKoTitleReady({ ...row, rss_title_ko: nextKo })) &&
      (Boolean(nextEn) || isWireEnTitleReady({ ...row, rss_title_en: nextEn }));

    const patch: Record<string, string | null> = {};
    if (!isWireKoTitleReady(row) && nextKo) patch.rss_title_ko = nextKo.slice(0, 300);
    if (!isWireEnTitleReady(row) && nextEn) patch.rss_title_en = nextEn.slice(0, 300);
    if (ready) patch.wire_titles_ready_at = new Date().toISOString();
    if (Object.keys(patch).length === 0) continue;

    const { error: updErr } = await client
      .from("collection_candidates")
      .update(patch)
      .eq("id", id);
    if (!updErr) updated += 1;
  }

  return {
    ok: true,
    scanned: rows.length,
    needing: needing.length,
    updated,
    openaiCalls: 1,
    skippedReady,
    schemaReady: true,
  };
}

/** Fire-and-forget after collect — never fails the RSS run. */
export function scheduleWireTitleLocalizationAfterCollect(limit = WIRE_LOCALIZE_BATCH_SIZE): void {
  void localizeWireCandidateTitles({ limit }).then(
    (result) => {
      console.info("[news-wire] localize after collect", result);
    },
    (err) => {
      console.warn("[news-wire] localize after collect failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  );
}
