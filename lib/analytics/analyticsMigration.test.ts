import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migration = readFileSync(
  new URL("../../migrations/20260901_analytics_events.sql", import.meta.url),
  "utf8"
);

describe("analytics migration security", () => {
  it("enables RLS and restricts RPC execute to service_role", () => {
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
    assert.match(migration, /TO service_role/i);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.analytics_admin_summary/i);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.analytics_admin_summary\(integer\) TO service_role/i);
    assert.match(migration, /SET search_path = public/i);
  });

  it("stores normalized search_query instead of hash-only column", () => {
    assert.match(migration, /search_query text/);
    assert.doesNotMatch(migration, /search_query_hash/);
  });

  it("uses dedupe_key unique index for short-term duplicate mitigation", () => {
    assert.match(migration, /dedupe_key text NOT NULL/);
    assert.match(migration, /analytics_events_dedupe_key_uq/);
  });

  it("provides manual anonymize function for 30-day search text retention", () => {
    assert.match(migration, /anonymize_analytics_search_queries/);
    assert.match(migration, /SET search_query = NULL/i);
    assert.doesNotMatch(migration, /DELETE FROM analytics_events/i);
    assert.match(migration, /p_retention_days integer DEFAULT 30/);
  });

  it("adds DB-level allowlist and length checks", () => {
    assert.match(migration, /analytics_events_event_name_chk/);
    assert.match(migration, /analytics_events_locale_chk/);
    assert.match(migration, /analytics_events_search_query_len_chk/);
  });
});

describe("analytics aggregation RPC", () => {
  it("aggregates in SQL without row fetch limits", () => {
    assert.match(migration, /count\(\*\)/i);
    assert.match(migration, /GROUP BY article_id/i);
    assert.doesNotMatch(migration, /LIMIT 5000/i);
  });
});
