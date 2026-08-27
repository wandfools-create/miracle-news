import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHORTS_PRODUCTION_STORE_REQUIRED_MESSAGE,
  assertDraftEditable,
  resolveShortsPackageStoreMode,
} from "./types";
import {
  mapCreateInputToInsert,
  mapSupabaseRowToRecord,
  type ShortsPackageDbRow,
} from "./supabaseMapping";
import { createMemoryShortsPackageRepository } from "./fileShortsPackageRepository";
import { generateStubShortsPackage } from "@/lib/shorts/generateStubShortsPackage";
import { SHORTS_CLOSING_LINE } from "@/lib/shorts/shortsPackageTypes";

const sampleArticles = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    source: "ap",
    source_country: "US",
    title_ko: "미국 증시 상승",
    title_original: "US stocks rise",
    summary_ko: "미국 증시가 상승 마감했다.",
    summary_original: "US stocks closed higher.",
    body_translated: null,
    body_original: null,
    original_url: "https://example.com/a",
    canonical_url: null,
    thumbnail_url: null,
    published_at: "2026-08-26T14:00:00.000Z",
    ko_slug: "us-stocks-rise-11111111",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    source: "reuters",
    source_country: "US",
    title_ko: "유가 소폭 하락",
    title_original: "Oil slips",
    summary_ko: "국제 유가가 소폭 하락했다.",
    summary_original: "Oil prices edged lower.",
    body_translated: null,
    body_original: null,
    original_url: "https://example.com/b",
    canonical_url: null,
    thumbnail_url: null,
    published_at: "2026-08-26T15:00:00.000Z",
    ko_slug: "oil-slips-22222222",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    source: "bbc",
    source_country: "GB",
    title_ko: "유럽 중앙은행 금리 동결",
    title_original: "ECB holds rates",
    summary_ko: "ECB가 금리를 동결했다.",
    summary_original: "The ECB held rates steady.",
    body_translated: null,
    body_original: null,
    original_url: "https://example.com/c",
    canonical_url: null,
    thumbnail_url: null,
    published_at: "2026-08-26T16:00:00.000Z",
    ko_slug: "ecb-holds-33333333",
  },
];

describe("resolveShortsPackageStoreMode", () => {
  it("rejects file and unset store in production", () => {
    const unset = resolveShortsPackageStoreMode({
      nodeEnv: "production",
      store: undefined,
    });
    assert.equal(unset.ok, false);
    if (!unset.ok) {
      assert.equal(unset.error, SHORTS_PRODUCTION_STORE_REQUIRED_MESSAGE);
    }

    const file = resolveShortsPackageStoreMode({
      nodeEnv: "production",
      store: "file",
    });
    assert.equal(file.ok, false);
  });

  it("allows supabase only in production", () => {
    const ok = resolveShortsPackageStoreMode({
      nodeEnv: "production",
      store: "supabase",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.mode, "supabase");
  });

  it("defaults to file in non-production", () => {
    const ok = resolveShortsPackageStoreMode({
      nodeEnv: "test",
      store: undefined,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.mode, "file");
  });
});

describe("Supabase repository mapping", () => {
  it("maps DB row ↔ record and create insert", () => {
    const row: ShortsPackageDbRow = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      desk: "morning",
      edit_date: "2026-08-26",
      article_ids: sampleArticles.map((a) => a.id),
      status: "draft",
      package: generateStubShortsPackage({
        desk: "morning",
        editDate: "2026-08-26",
        articles: sampleArticles,
      }),
      generation_mode: "stub",
      created_by: "admin@example.com",
      generated_at: "2026-08-26T12:00:00.000Z",
      created_at: "2026-08-26T12:00:00.000Z",
      updated_at: "2026-08-26T12:00:00.000Z",
      reviewed_at: null,
    };

    const record = mapSupabaseRowToRecord(row);
    assert.equal(record.desk, "morning");
    assert.equal(record.editDate, "2026-08-26");
    assert.equal(record.reviewedAt, null);
    assert.equal(record.package.sourceArticles.length, 3);

    const insert = mapCreateInputToInsert({
      desk: "evening",
      editDate: "2026-08-26",
      articleIds: sampleArticles.map((a) => a.id),
      package: row.package,
      generationMode: "stub",
      createdBy: "admin@example.com",
    });
    assert.equal(insert.status, "draft");
    assert.equal(insert.reviewed_at, null);
    assert.equal(insert.desk, "evening");
  });
});

describe("memory repository reviewed policy", () => {
  it("rejects direct edit while reviewed; allows after revert", async () => {
    const repo = createMemoryShortsPackageRepository();
    const pkg = generateStubShortsPackage({
      desk: "morning",
      editDate: "2026-08-26",
      articles: sampleArticles,
    });
    const created = await repo.create({
      desk: "morning",
      editDate: "2026-08-26",
      articleIds: sampleArticles.map((a) => a.id),
      package: pkg,
      generationMode: "stub",
      createdBy: "admin@example.com",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const reviewed = await repo.markReviewed(created.data.id, {
      ...pkg,
      hook: "reviewed hook",
    });
    assert.equal(reviewed.ok, true);

    const blocked = await repo.updateDraft(created.data.id, {
      ...pkg,
      hook: "should fail",
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.step, "reviewed_readonly");

    const reverted = await repo.revertToDraft(created.data.id);
    assert.equal(reverted.ok, true);

    const updated = await repo.updateDraft(created.data.id, {
      ...pkg,
      hook: "after revert",
    });
    assert.equal(updated.ok, true);
    if (updated.ok) assert.equal(updated.data.package.hook, "after revert");
  });

  it("assertDraftEditable blocks reviewed", () => {
    assert.equal(assertDraftEditable("draft").ok, true);
    assert.equal(assertDraftEditable("reviewed").ok, false);
  });
});

describe("OpenAI failure must not invent empty package", () => {
  it("stub package always includes closing line and sources", () => {
    const pkg = generateStubShortsPackage({
      desk: "morning",
      editDate: "2026-08-26",
      articles: sampleArticles,
    });
    assert.ok(pkg.narration.includes(SHORTS_CLOSING_LINE));
    assert.equal(pkg.sourceArticles.length, 3);
    assert.ok(pkg.sourceArticles.every((s) => s.articleId && s.title));
  });
});
