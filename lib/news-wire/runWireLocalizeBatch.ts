/**
 * Injectable News Wire title-localize batch runner (no server-only).
 */
import {
  buildWireTitlePatchesFromOpenAi,
  clampWireLocalizeLimit,
  type WireLocalizeRow,
} from "@/lib/news-wire/localizeWireTitlesLogic";
import { NEWS_WIRE_INCLUDE_STATUSES } from "@/lib/news-wire/types";
import {
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
} from "@/lib/news-wire/wireTitles";

export type WireLocalizeBatchResult =
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
      updated?: number;
    };

/** Supabase-like client; typed loosely so scripts and service-role both work. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WireLocalizeDbClient = { from: (table: string) => any };

export type WireChatCompletion = <T extends Record<string, unknown>>(input: {
  step: string;
  system: string;
  user: string;
  temperature?: number;
  model?: string;
}) => Promise<
  | { ok: true; data: T }
  | { ok: false; error: string; step?: string }
>;

const SYSTEM_PROMPT =
  "You are a news headline translator. Output JSON only: " +
  '{"items":[{"id":string,"title_ko":string,"title_en":string}]}.\n' +
  "Rules:\n" +
  "- Translate each RSS headline only (never article body).\n" +
  "- Provide natural Korean in title_ko and natural English in title_en.\n" +
  "- Keep names, numbers, and proper nouns accurate.\n" +
  "- Do not invent facts. Return one object per input id.";

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

export async function runWireLocalizeBatch(options: {
  client: WireLocalizeDbClient;
  chatCompletionJson: WireChatCompletion;
  getModel: () => string;
  checkOpenAiEnv: () =>
    | { ok: true }
    | { ok: false; error: string; step: string };
  limit?: number;
  candidateIds?: string[];
  /** Optional created_at lower bound (ISO). */
  createdAtGte?: string | null;
}): Promise<WireLocalizeBatchResult> {
  const limit = clampWireLocalizeLimit(options.limit);
  const client = options.client;

  const probe = await client
    .from("collection_candidates")
    .select("rss_title_en, wire_titles_ready_at")
    .limit(1);
  if (probe.error && isMissingWireColumn(probe.error)) {
    return {
      ok: false,
      error: "wire_title_columns_missing",
      step: "schema",
      openaiCalls: 0,
      schemaReady: false,
    };
  }
  if (probe.error) {
    return {
      ok: false,
      error: probe.error.message ?? "schema_probe_failed",
      step: "schema_probe",
      openaiCalls: 0,
      schemaReady: false,
    };
  }

  const selectCols =
    "id, rss_title, rss_title_ko, rss_title_en, wire_titles_ready_at, created_at, status";

  let rows: WireLocalizeRow[] = [];

  if (options.candidateIds?.length) {
    const ids = [
      ...new Set(
        options.candidateIds.map((id) => id.trim()).filter(Boolean)
      ),
    ].slice(0, limit);
    const fetched = await client
      .from("collection_candidates")
      .select(selectCols)
      .in("id", ids)
      .in("status", NEWS_WIRE_INCLUDE_STATUSES)
      .order("created_at", { ascending: false });
    if (fetched.error) {
      if (isMissingWireColumn(fetched.error)) {
        return {
          ok: false,
          error: "wire_title_columns_missing",
          step: "schema",
          openaiCalls: 0,
          schemaReady: false,
        };
      }
      return {
        ok: false,
        error: fetched.error.message ?? "fetch_failed",
        step: "fetch",
        openaiCalls: 0,
        schemaReady: true,
      };
    }
    rows = (fetched.data ?? []) as WireLocalizeRow[];
  } else {
    let q = client
      .from("collection_candidates")
      .select(selectCols)
      .in("status", NEWS_WIRE_INCLUDE_STATUSES)
      .is("wire_titles_ready_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (options.createdAtGte) {
      q = client
        .from("collection_candidates")
        .select(selectCols)
        .in("status", NEWS_WIRE_INCLUDE_STATUSES)
        .is("wire_titles_ready_at", null)
        .gte("created_at", options.createdAtGte)
        .order("created_at", { ascending: false })
        .limit(limit);
    }
    const fetched = await q;
    if (fetched.error) {
      if (isMissingWireColumn(fetched.error)) {
        return {
          ok: false,
          error: "wire_title_columns_missing",
          step: "schema",
          openaiCalls: 0,
          schemaReady: false,
        };
      }
      return {
        ok: false,
        error: fetched.error.message ?? "fetch_failed",
        step: "fetch",
        openaiCalls: 0,
        schemaReady: true,
      };
    }
    rows = (fetched.data ?? []) as WireLocalizeRow[];
  }

  const scanned = rows.length;
  let skippedReady = 0;
  let updated = 0;
  const stillNeedModel: WireLocalizeRow[] = [];

  for (const row of rows) {
    if (row.wire_titles_ready_at != null && isWireTitlesReady(row)) {
      skippedReady += 1;
      continue;
    }
    if (isWireTitlesReady(row)) {
      const readyRes = await client
        .from("collection_candidates")
        .update({ wire_titles_ready_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("wire_titles_ready_at", null);
      if (readyRes.error) {
        return {
          ok: false,
          error: readyRes.error.message ?? "update_ready_at_failed",
          step: "update_ready_at",
          openaiCalls: 0,
          schemaReady: true,
          updated,
        };
      }
      updated += 1;
      continue;
    }
    stillNeedModel.push(row);
  }

  const needingTotal = stillNeedModel.length + updated;

  if (stillNeedModel.length === 0) {
    return {
      ok: true,
      scanned,
      needing: needingTotal,
      updated,
      openaiCalls: 0,
      skippedReady,
      schemaReady: true,
    };
  }

  const openAi = options.checkOpenAiEnv();
  if (!openAi.ok) {
    return {
      ok: false,
      error: openAi.error,
      step: openAi.step,
      openaiCalls: 0,
      schemaReady: true,
      updated,
    };
  }

  const payload = stillNeedModel.map((row) => ({
    id: row.id,
    title: row.rss_title,
    need_ko: !isWireKoTitleReady(row),
    need_en: !isWireEnTitleReady(row),
  }));

  const completion = await options.chatCompletionJson<{
    items?: Array<{ id?: unknown; title_ko?: unknown; title_en?: unknown }>;
  }>({
    step: "news_wire_title_localize",
    model: options.getModel(),
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
      updated,
    };
  }

  const built = buildWireTitlePatchesFromOpenAi({
    needing: stillNeedModel,
    items: completion.data.items,
  });
  if (!built.ok) {
    return {
      ok: false,
      error: built.error,
      step: built.step,
      openaiCalls: 1,
      schemaReady: true,
      updated,
    };
  }

  for (const { id, patch } of built.patches) {
    const upd = await client
      .from("collection_candidates")
      .update(patch)
      .eq("id", id)
      .is("wire_titles_ready_at", null);
    if (upd.error) {
      return {
        ok: false,
        error: upd.error.message ?? "update_failed",
        step: "update",
        openaiCalls: 1,
        schemaReady: true,
        updated,
      };
    }
    updated += 1;
  }

  return {
    ok: true,
    scanned,
    needing: needingTotal,
    updated,
    openaiCalls: 1,
    skippedReady,
    schemaReady: true,
  };
}
