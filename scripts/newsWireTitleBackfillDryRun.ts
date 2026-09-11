/**
 * Dry-run estimate for News Wire title localization backfill.
 * Default: dry-run only. Never calls OpenAI. Never writes DB.
 *
 * Usage:
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts --days=7
 *   npx tsx scripts/newsWireTitleBackfillDryRun.ts --all
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import { NEWS_WIRE_INCLUDE_STATUSES } from "../lib/news-wire/types";
import {
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
} from "../lib/news-wire/wireTitles";

function loadEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env.local");
  const raw = fs.readFileSync(envPath, "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]!] = v;
  }
  return env;
}

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

async function main() {
  const { days, all } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const sb = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let query = sb
    .from("collection_candidates")
    .select(
      "id, rss_title, rss_title_ko, status, created_at",
      { count: "exact" }
    )
    .in("status", NEWS_WIRE_INCLUDE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (!all && days != null) {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    query = query.gte("created_at", since);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("query failed", error.message);
    process.exit(1);
  }

  // Probe new columns without failing the dry-run.
  let schemaReady = true;
  const { error: probeErr } = await sb
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

  const rows = data ?? [];
  let needKo = 0;
  let needEn = 0;
  let needAny = 0;
  let alreadyReady = 0;
  for (const row of rows) {
    const withEn = {
      ...row,
      rss_title_en: null as string | null,
      wire_titles_ready_at: null as string | null,
    };
    const koReady = isWireKoTitleReady(withEn);
    const enReady = isWireEnTitleReady(withEn);
    if (koReady && enReady) {
      alreadyReady += 1;
      continue;
    }
    needAny += 1;
    if (!koReady) needKo += 1;
    if (!enReady) needEn += 1;
  }

  // Rough nano cost: ~$0.0004 blended / 1K tokens; ~400 tokens/item.
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
        countExact: count,
        alreadyWireReadyNative: alreadyReady,
        needingAnyTitleWork: needAny,
        needingKoTitle: needKo,
        needingEnTitle: needEn,
        estimatedOpenAiCallsBatchesOf40: Math.ceil(needAny / 40),
        estimatedUsdRough: estimatedUsd,
        note: schemaReady
          ? "No OpenAI called. No DB writes. Approve separately to execute."
          : "migration 20260911 not applied yet; estimate uses native-title heuristics only.",
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
