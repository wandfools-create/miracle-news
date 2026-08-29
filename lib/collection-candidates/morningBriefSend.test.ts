/**
 * Morning brief selection / pagination fixtures. No Discord, OpenAI, or DB.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectMorningBriefRowsByPagination,
  MORNING_BRIEF_FETCH_PAGE_SIZE,
} from "./morningBriefPagination";
import {
  isMorningBriefSendEligible,
  selectMorningBriefItemsFromRows,
} from "./morningBriefSelection";
import type { CollectionCandidateRow } from "./types";
import { sourceKeysForCollectRegion } from "@/lib/rss/collectRegions";

function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `11111111-1111-4111-8111-${hex}`;
}

function row(partial: Partial<CollectionCandidateRow> & { id: string }): CollectionCandidateRow {
  return {
    id: partial.id,
    source: partial.source ?? "ap",
    source_country: partial.source_country ?? "US",
    feed_label: partial.feed_label ?? "AP",
    original_url: partial.original_url ?? `https://apnews.com/${partial.id}`,
    rss_title: partial.rss_title ?? `Title ${partial.id}`,
    rss_summary: partial.rss_summary ?? "Summary about politics and Congress.",
    rss_title_ko: null,
    rss_summary_ko: null,
    rss_published_at: partial.rss_published_at ?? "2026-08-28T12:00:00.000Z",
    rss_guid: null,
    thumbnail_url: null,
    category: partial.category ?? "politics",
    custom_unique_id: null,
    status: partial.status ?? "pending",
    selected_at: null,
    selected_by: null,
    dismissed_at: null,
    dismissed_by: null,
    dismiss_reason: null,
    enrich_started_at: null,
    enrich_completed_at: null,
    enrich_step: null,
    enrich_error: null,
    enrich_category: null,
    enrich_attempt_count: 0,
    article_id: null,
    collection_run_id: null,
    ai_recommend_grade: partial.ai_recommend_grade ?? "best",
    ai_recommend_score: partial.ai_recommend_score ?? 80,
    ai_recommend_reason: partial.ai_recommend_reason ?? "test",
    ai_recommended_at: partial.ai_recommended_at ?? "2026-08-28T10:00:00.000Z",
    discord_brief_sent_at: partial.discord_brief_sent_at ?? null,
    discord_brief_message_id: partial.discord_brief_message_id ?? null,
    created_at: partial.created_at ?? "2026-08-28T09:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-08-28T09:00:00.000Z",
  };
}

function sortLikeMorningBriefFetch(rows: CollectionCandidateRow[]): CollectionCandidateRow[] {
  return [...rows].sort((a, b) => {
    const ap = a.rss_published_at ?? "";
    const bp = b.rss_published_at ?? "";
    if (ap !== bp) return bp.localeCompare(ap);
    if (a.created_at !== b.created_at) {
      return b.created_at.localeCompare(a.created_at);
    }
    return a.id.localeCompare(b.id);
  });
}

describe("morning brief selection without legacy caps", () => {
  it("includes more than 10, 25, and 100 evaluated candidates including normal/low", () => {
    const topics = [
      "Congress votes on war powers resolution after overseas strike",
      "Federal Reserve signals interest rate path for next quarter",
      "Supreme Court accepts emergency appeal on voting rules",
      "Pentagon announces Indo-Pacific defense cooperation talks",
    ];
    const rows = Array.from({ length: 130 }, (_, i) =>
      row({
        id: uuid(i + 1),
        ai_recommend_grade:
          i % 4 === 0
            ? "best"
            : i % 4 === 1
              ? "priority"
              : i % 4 === 2
                ? "normal"
                : "low",
        rss_title: `${topics[i % topics.length]} — case ${i + 1}`,
        rss_summary: `Distinct policy update number ${i + 1} with unique details.`,
        original_url: `https://apnews.com/article/unique-${i + 1}`,
      })
    );

    const all = selectMorningBriefItemsFromRows(rows);
    assert.ok(all.length > 100, `expected >100 got ${all.length}`);
    assert.equal(all.length, rows.length);
    assert.ok(all.some((x) => x.aiRecommendGrade === "normal"));
    assert.ok(all.some((x) => x.aiRecommendGrade === "low"));
  });

  it("excludes already-sent candidates via eligibility helper", () => {
    assert.equal(
      isMorningBriefSendEligible({
        status: "pending",
        ai_recommended_at: "2026-08-28T10:00:00.000Z",
        discord_brief_sent_at: null,
      }),
      true
    );
    assert.equal(
      isMorningBriefSendEligible({
        status: "pending",
        ai_recommended_at: "2026-08-28T10:00:00.000Z",
        discord_brief_sent_at: "2026-08-28T11:00:00.000Z",
      }),
      false
    );
  });

  it("region source keys exclude other-desk outlets", () => {
    const usKeys = new Set(sourceKeysForCollectRegion("us-intl"));
    const krKeys = new Set(sourceKeysForCollectRegion("korea"));
    assert.ok(usKeys.has("ap"));
    assert.ok(!usKeys.has("yonhap-kr-radar"));
    assert.ok(krKeys.has("yonhap-kr-radar"));
    assert.ok(!krKeys.has("ap"));
  });
});

describe("collectMorningBriefRowsByPagination", () => {
  it("fetches every page beyond a single 100-row limit", async () => {
    const pages: CollectionCandidateRow[][] = [
      Array.from({ length: MORNING_BRIEF_FETCH_PAGE_SIZE }, (_, i) =>
        row({ id: uuid(i + 1) })
      ),
      Array.from({ length: MORNING_BRIEF_FETCH_PAGE_SIZE }, (_, i) =>
        row({ id: uuid(i + 101) })
      ),
      Array.from({ length: 12 }, (_, i) => row({ id: uuid(i + 201) })),
    ];
    let calls = 0;

    const result = await collectMorningBriefRowsByPagination(async () => {
      const page = pages[calls] ?? [];
      calls += 1;
      return { ok: true, rows: page };
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.rows.length, 212);
    assert.equal(calls, 3);
  });

  it("keeps stable page boundaries when many rows share the same timestamp", async () => {
    const sameTs = "2026-08-28T12:00:00.000Z";
    const sameCreated = "2026-08-28T09:00:00.000Z";
    const all = sortLikeMorningBriefFetch(
      Array.from({ length: MORNING_BRIEF_FETCH_PAGE_SIZE + 5 }, (_, i) =>
        row({
          id: uuid(i + 1),
          rss_published_at: sameTs,
          created_at: sameCreated,
        })
      )
    );

    const pageSize = MORNING_BRIEF_FETCH_PAGE_SIZE;
    const result = await collectMorningBriefRowsByPagination(
      async (from, to) => ({
        ok: true,
        rows: all.slice(from, to + 1),
      }),
      pageSize
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, all.length);
    assert.equal(result.rows[pageSize - 1]!.id, all[pageSize - 1]!.id);
    assert.equal(result.rows[pageSize]!.id, all[pageSize]!.id);
    assert.ok(result.rows[pageSize - 1]!.id < result.rows[pageSize]!.id);
  });
});

describe("fetchMorningBriefCandidateRows order wiring", () => {
  it("orders by rss_published_at, created_at, then id and paginates", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/collection-candidates/fetchMorningBriefCandidates.ts"),
      "utf8"
    );
    assert.match(src, /\.order\("rss_published_at"/);
    assert.match(src, /\.order\("created_at"/);
    assert.match(src, /\.order\("id"/);
    assert.match(src, /collectMorningBriefRowsByPagination/);
    assert.doesNotMatch(src, /\.limit\(100\)/);
  });

  it("brief path does not apply DISCORD_MORNING_BRIEF_MAX_ITEMS", () => {
    const runSrc = readFileSync(
      join(process.cwd(), "lib/discord/runMorningBrief.ts"),
      "utf8"
    );
    const envSrc = readFileSync(
      join(process.cwd(), "lib/discord/env.ts"),
      "utf8"
    );
    assert.match(runSrc, /fetchMorningBriefItems\(\{ region \}\)/);
    assert.doesNotMatch(runSrc, /morningBriefMaxItems/);
    assert.match(envSrc, /export function getMorningBriefMaxItems\(\): number \| null/);
    assert.match(envSrc, /return null;/);
    assert.doesNotMatch(envSrc, /morningBriefMaxItems:/);
  });
});
