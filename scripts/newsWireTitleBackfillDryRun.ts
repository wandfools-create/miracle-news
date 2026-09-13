/**
 * News Wire title localization backfill.
 * Default: dry-run only (no OpenAI, no DB writes).
 *
 * Usage:
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts --days=7
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts --all
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts --execute --confirm=TRANSLATE_WIRE_TITLES --max-items=40
 */
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { collectRowsByRangePagination } from "../lib/collection-candidates/candidateFetchPagination";
import { NEWS_WIRE_INCLUDE_STATUSES } from "../lib/news-wire/types";
import {
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
} from "../lib/news-wire/wireTitles";
import { runWireLocalizeBatch } from "../lib/news-wire/runWireLocalizeBatch";
import { WIRE_LOCALIZE_BATCH_SIZE } from "../lib/news-wire/localizeWireTitlesLogic";

loadEnvConfig(process.cwd());

const PAGE_SIZE = 50;
const DEFAULT_CANDIDATE_MODEL = "gpt-5.4-nano";
const EXECUTE_CONFIRM = "TRANSLATE_WIRE_TITLES";

function parseArgs(argv: string[]) {
  let days: number | null = 7;
  let all = false;
  let execute = false;
  let confirm: string | null = null;
  let maxItems = WIRE_LOCALIZE_BATCH_SIZE;
  for (const arg of argv) {
    if (arg === "--all") {
      all = true;
      days = null;
    }
    if (arg === "--execute") execute = true;
    const confirmMatch = arg.match(/^--confirm=(.+)$/);
    if (confirmMatch) confirm = confirmMatch[1] ?? null;
    const daysMatch = arg.match(/^--days=(\d+)$/);
    if (daysMatch) days = Number(daysMatch[1]);
    const maxMatch = arg.match(/^--max-items=(\d+)$/);
    if (maxMatch) {
      maxItems = Math.max(1, Number(maxMatch[1]));
    }
  }
  return { days, all, execute, confirm, maxItems };
}

function resolveCandidateModelName(): string {
  return process.env.OPENAI_CANDIDATE_MODEL?.trim() || DEFAULT_CANDIDATE_MODEL;
}

type Row = {
  id: string;
  rss_title: string;
  rss_title_ko: string | null;
  rss_title_en?: string | null;
  wire_titles_ready_at?: string | null;
  status: string;
  created_at: string;
};

function createScriptClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (via loadEnvConfig)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function estimateTokens(needAny: number): {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
} {
  const systemTokens = 120;
  const avgTitleTokens = 28;
  const perItemInput = avgTitleTokens + 12;
  const perItemOutput = avgTitleTokens * 2 + 16;
  const batches = Math.max(1, Math.ceil(needAny / 40));
  return {
    estimatedInputTokens: systemTokens * batches + perItemInput * needAny,
    estimatedOutputTokens: perItemOutput * needAny,
  };
}

async function probeSchema(
  client: SupabaseClient
): Promise<{ schemaReady: boolean }> {
  const { error: probeErr } = await client
    .from("collection_candidates")
    .select("rss_title_en, wire_titles_ready_at")
    .limit(1);
  if (
    probeErr &&
    (`${probeErr.message} ${probeErr.code ?? ""}`.includes("rss_title_en") ||
      `${probeErr.message}`.includes("wire_titles_ready_at"))
  ) {
    return { schemaReady: false };
  }
  if (probeErr) throw new Error(probeErr.message);
  return { schemaReady: true };
}

async function countNeeding(
  client: SupabaseClient,
  options: { sinceIso: string | null; schemaReady: boolean }
): Promise<{
  scanned: number;
  countExact: number | null;
  needAny: number;
  needKo: number;
  needEn: number;
  alreadyReady: number;
}> {
  const selectCols = options.schemaReady
    ? "id, rss_title, rss_title_ko, rss_title_en, wire_titles_ready_at, status, created_at"
    : "id, rss_title, rss_title_ko, status, created_at";

  let countQuery = client
    .from("collection_candidates")
    .select("id", { count: "exact", head: true })
    .in("status", NEWS_WIRE_INCLUDE_STATUSES);
  if (options.sinceIso) countQuery = countQuery.gte("created_at", options.sinceIso);
  const { count: countExact, error: countErr } = await countQuery;
  if (countErr) throw new Error(countErr.message);

  const fetched = await collectRowsByRangePagination<Row>(
    async (from, to) => {
      let q = client
        .from("collection_candidates")
        .select(selectCols)
        .in("status", NEWS_WIRE_INCLUDE_STATUSES)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (options.sinceIso) q = q.gte("created_at", options.sinceIso);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      return { ok: true, rows: (data ?? []) as unknown as Row[] };
    },
    PAGE_SIZE
  );
  if (!fetched.ok) throw new Error(fetched.error);

  let needKo = 0;
  let needEn = 0;
  let needAny = 0;
  let alreadyReady = 0;
  for (const row of fetched.rows) {
    const normalized = options.schemaReady
      ? row
      : { ...row, rss_title_en: null, wire_titles_ready_at: null };
    if (options.schemaReady && isWireTitlesReady(normalized)) {
      alreadyReady += 1;
      continue;
    }
    if (!options.schemaReady) {
      const koReady = isWireKoTitleReady(normalized);
      const enReady = isWireEnTitleReady(normalized);
      if (koReady && enReady) {
        alreadyReady += 1;
        continue;
      }
      needAny += 1;
      if (!koReady) needKo += 1;
      if (!enReady) needEn += 1;
      continue;
    }
    needAny += 1;
    if (!isWireKoTitleReady(normalized)) needKo += 1;
    if (!isWireEnTitleReady(normalized)) needEn += 1;
  }

  return {
    scanned: fetched.rows.length,
    countExact: countExact ?? null,
    needAny,
    needKo,
    needEn,
    alreadyReady,
  };
}

async function scriptChatCompletionJson<T extends Record<string, unknown>>(input: {
  step: string;
  system: string;
  user: string;
  temperature?: number;
  model?: string;
}): Promise<{ ok: true; data: T } | { ok: false; error: string; step?: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY missing", step: "openai_env_check" };
  }
  const model = input.model?.trim() || resolveCandidateModelName();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });
  const rawText = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      error: `OpenAI HTTP ${res.status}`,
      step: input.step,
    };
  }
  try {
    const envelope = JSON.parse(rawText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = envelope.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      return { ok: false, error: "empty_openai_content", step: input.step };
    }
    return { ok: true, data: JSON.parse(content) as T };
  } catch {
    return { ok: false, error: "openai_parse_failed", step: input.step };
  }
}

async function runDryReport(options: {
  client: SupabaseClient;
  days: number | null;
  all: boolean;
  schemaReady: boolean;
}) {
  const sinceIso =
    !options.all && options.days != null
      ? new Date(Date.now() - options.days * 86400_000).toISOString()
      : null;
  const stats = await countNeeding(options.client, {
    sinceIso,
    schemaReady: options.schemaReady,
  });
  const tokens = estimateTokens(stats.needAny);
  const model = resolveCandidateModelName();
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        schemaReady: options.schemaReady,
        scope: options.all ? "all_active" : `last_${options.days}_days`,
        model,
        pricingStatus: "pricing_unverified",
        activeCandidatesScanned: stats.scanned,
        countExact: stats.countExact,
        scannedMatchesCountExact: stats.scanned === (stats.countExact ?? -1),
        alreadyWireReady: stats.alreadyReady,
        needingAnyTitleWork: stats.needAny,
        needingKoTitle: stats.needKo,
        needingEnTitle: stats.needEn,
        estimatedOpenAiCallsBatchesOf40: Math.ceil(stats.needAny / 40) || 0,
        estimatedInputTokens: tokens.estimatedInputTokens,
        estimatedOutputTokens: tokens.estimatedOutputTokens,
        estimatedUsd: null,
        note: "Token counts are rough estimates only. Official USD pricing for this model was not verified — do not treat as a confirmed cost. No OpenAI called. No DB writes.",
      },
      null,
      2
    )
  );
}

async function runExecute(options: {
  client: SupabaseClient;
  days: number | null;
  all: boolean;
  maxItems: number;
}) {
  const { schemaReady } = await probeSchema(options.client);
  if (!schemaReady) {
    console.log(
      JSON.stringify({
        dryRun: false,
        ok: false,
        error: "schema_not_ready",
        targeted: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0,
        openaiCalls: 0,
      })
    );
    process.exit(1);
  }

  const sinceIso =
    !options.all && options.days != null
      ? new Date(Date.now() - options.days * 86400_000).toISOString()
      : null;

  // Remaining = active rows with ready_at null (and still needing after heuristics).
  async function countRemaining(): Promise<number> {
    let q = options.client
      .from("collection_candidates")
      .select("id", { count: "exact", head: true })
      .in("status", NEWS_WIRE_INCLUDE_STATUSES)
      .is("wire_titles_ready_at", null);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  let remainingBefore = await countRemaining();
  const targeted = Math.min(options.maxItems, remainingBefore);
  let succeeded = 0;
  let failed = 0;
  let openaiCalls = 0;
  let processed = 0;

  while (processed < targeted) {
    const batchLimit = Math.min(
      WIRE_LOCALIZE_BATCH_SIZE,
      targeted - processed
    );
    const result = await runWireLocalizeBatch({
      client: options.client,
      chatCompletionJson: scriptChatCompletionJson,
      getModel: resolveCandidateModelName,
      checkOpenAiEnv: () => {
        if (!process.env.OPENAI_API_KEY?.trim()) {
          return {
            ok: false,
            error: "OPENAI_API_KEY missing",
            step: "openai_env_check",
          };
        }
        return { ok: true };
      },
      limit: batchLimit,
      createdAtGte: sinceIso,
    });

    openaiCalls += result.openaiCalls;
    if (!result.ok) {
      failed += 1;
      const remaining = await countRemaining();
      console.log(
        JSON.stringify({
          dryRun: false,
          ok: false,
          error: result.error,
          step: result.step,
          targeted,
          succeeded,
          failed,
          remaining,
          openaiCalls,
        })
      );
      process.exit(1);
    }

    if (result.updated === 0) {
      const remaining = await countRemaining();
      if (remaining > 0) {
        console.log(
          JSON.stringify({
            dryRun: false,
            ok: false,
            error: "no_progress_with_remaining",
            targeted,
            succeeded,
            failed: failed + 1,
            remaining,
            openaiCalls,
          })
        );
        process.exit(1);
      }
      break;
    }

    succeeded += result.updated;
    processed += result.updated;
    remainingBefore = await countRemaining();
    if (remainingBefore === 0) break;
  }

  const remaining = await countRemaining();
  console.log(
    JSON.stringify({
      dryRun: false,
      ok: true,
      targeted,
      succeeded,
      failed,
      remaining,
      openaiCalls,
    })
  );
}

async function main() {
  const { days, all, execute, confirm, maxItems } = parseArgs(
    process.argv.slice(2)
  );
  const client = createScriptClient();

  if (execute) {
    if (confirm !== EXECUTE_CONFIRM) {
      console.log(
        JSON.stringify({
          dryRun: false,
          ok: false,
          error: "confirm_required",
          hint: "--execute requires --confirm=TRANSLATE_WIRE_TITLES",
          targeted: 0,
          succeeded: 0,
          failed: 0,
          remaining: 0,
          openaiCalls: 0,
        })
      );
      process.exit(1);
    }
    await runExecute({ client, days, all, maxItems });
    return;
  }

  const { schemaReady } = await probeSchema(client);
  await runDryReport({ client, days, all, schemaReady });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
