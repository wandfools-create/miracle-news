/**
 * Dry-run estimate for News Wire title localization backfill.
 * Default: dry-run only. Never calls OpenAI. Never writes DB.
 *
 * Usage:
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts --days=7
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts --all
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

import { collectRowsByRangePagination } from "../lib/collection-candidates/candidateFetchPagination";
import { NEWS_WIRE_INCLUDE_STATUSES } from "../lib/news-wire/types";
import {
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
} from "../lib/news-wire/wireTitles";

loadEnvConfig(process.cwd());

const PAGE_SIZE = 50;

function parseArgs(argv: string[]) {
  let days: number | null = 7;
  let all = false;
  for (const arg of argv) {
    if (arg === "--all") {
      all = true;
      days = null;
    }
    const m = arg.match(/^--days=(\d+)$/);
    if (m) days = Number(m[1]);
  }
  return { days, all };
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

function createDryRunClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (via loadEnvConfig)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const { days, all } = parseArgs(process.argv.slice(2));
  const client = createDryRunClient();

  let schemaReady = true;
  const { error: probeErr } = await client
    .from("collection_candidates")
    .select("rss_title_en, wire_titles_ready_at")
    .limit(1);
  if (
    probeErr &&
    (`${probeErr.message} ${probeErr.code ?? ""}`.includes("rss_title_en") ||
      `${probeErr.message}`.includes("wire_titles_ready_at"))
  ) {
    schemaReady = false;
  }

  const selectCols = schemaReady
    ? "id, rss_title, rss_title_ko, rss_title_en, wire_titles_ready_at, status, created_at"
    : "id, rss_title, rss_title_ko, status, created_at";

  let countQuery = client
    .from("collection_candidates")
    .select("id", { count: "exact", head: true })
    .in("status", NEWS_WIRE_INCLUDE_STATUSES);
  if (!all && days != null) {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    countQuery = countQuery.gte("created_at", since);
  }
  const { count: countExact, error: countErr } = await countQuery;
  if (countErr) {
    console.error("count failed", countErr.message);
    process.exit(1);
  }

  const sinceIso =
    !all && days != null
      ? new Date(Date.now() - days * 86400_000).toISOString()
      : null;

  const fetched = await collectRowsByRangePagination<Row>(
    async (from, to) => {
      let q = client
        .from("collection_candidates")
        .select(selectCols)
        .in("status", NEWS_WIRE_INCLUDE_STATUSES)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q;
      if (error) return { ok: false, error: error.message };
      return { ok: true, rows: (data ?? []) as unknown as Row[] };
    },
    PAGE_SIZE
  );

  if (!fetched.ok) {
    console.error("scan failed", fetched.error);
    process.exit(1);
  }

  const rows = fetched.rows;
  let needKo = 0;
  let needEn = 0;
  let needAny = 0;
  let alreadyReady = 0;

  for (const row of rows) {
    const normalized = schemaReady
      ? row
      : {
          ...row,
          rss_title_en: null,
          wire_titles_ready_at: null,
        };

    if (schemaReady && isWireTitlesReady(normalized)) {
      alreadyReady += 1;
      continue;
    }
    if (!schemaReady) {
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

  const estTokensPerItem = 400;
  const estUsdPer1kTokens = 0.0004;
  const estimatedUsd =
    Math.round(
      ((needAny * estTokensPerItem) / 1000) * estUsdPer1kTokens * 10000
    ) / 10000;

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        schemaReady,
        scope: all ? "all_active" : `last_${days}_days`,
        activeCandidatesScanned: rows.length,
        countExact: countExact ?? null,
        scannedMatchesCountExact: rows.length === (countExact ?? -1),
        alreadyWireReady: alreadyReady,
        needingAnyTitleWork: needAny,
        needingKoTitle: needKo,
        needingEnTitle: needEn,
        estimatedOpenAiCallsBatchesOf40: Math.ceil(needAny / 40),
        estimatedUsdRough: estimatedUsd,
        note: schemaReady
          ? "No OpenAI called. No DB writes. Ready titles excluded from cost."
          : "migration 20260911 not applied; estimate uses native-title heuristics only.",
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
