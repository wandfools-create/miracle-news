import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { generateStubShortsPackage } from "./generateStubShortsPackage";
import { parseShortsProductionPackageJson } from "./parseShortsPackageJson";
import { createFileShortsPackageRepository } from "./repository/fileShortsPackageRepository";
import { resolveShortsOpenAiModel } from "./shortsPackageEnv";

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
    ko_slug: "us-stocks-11111111",
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
    thumbnail_url: "https://example.com/thumb.jpg",
    published_at: "2026-08-26T15:00:00.000Z",
    ko_slug: "oil-22222222",
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
    ko_slug: "ecb-33333333",
  },
];

describe("Shorts stub generation and file repository", () => {
  it("generates stub package that passes JSON validation", () => {
    const pkg = generateStubShortsPackage({
      desk: "morning",
      editDate: "2026-08-26",
      articles: sampleArticles,
    });
    const parsed = parseShortsProductionPackageJson(pkg);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.package.sourceArticles.length, 3);
      assert.ok(parsed.package.narration.includes("한눈에서 확인하세요"));
      assert.ok(
        parsed.package.sourceArticles[0]?.hannoonUrl?.includes("/ko/article/")
      );
      assert.equal(
        parsed.package.sourceArticles[0]?.originalUrl,
        "https://example.com/a"
      );
    }
  });

  it("persists and reloads package records via file repository", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "shorts-pkg-"));
    try {
      const repo = createFileShortsPackageRepository(root);
      const created = await repo.create({
        desk: "evening",
        editDate: "2026-08-26",
        articleIds: sampleArticles.map((a) => a.id),
        package: generateStubShortsPackage({
          desk: "evening",
          editDate: "2026-08-26",
          articles: sampleArticles,
        }),
        generationMode: "stub",
        createdBy: "test@example.com",
      });
      assert.equal(created.ok, true);
      if (!created.ok) return;

      const loaded = await repo.getById(created.data.id);
      assert.equal(loaded.ok, true);
      if (loaded.ok) assert.equal(loaded.data?.status, "draft");

      const list = await repo.listRecent();
      assert.equal(list.ok, true);
      if (list.ok) assert.equal(list.data.length, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("resolveShortsOpenAiModel", () => {
  it("follows SHORTS → ARTICLE → MODEL → default", () => {
    assert.equal(
      resolveShortsOpenAiModel({
        OPENAI_SHORTS_MODEL: "shorts-model",
        OPENAI_ARTICLE_MODEL: "article-model",
        OPENAI_MODEL: "legacy",
      }),
      "shorts-model"
    );
    assert.equal(
      resolveShortsOpenAiModel({
        OPENAI_ARTICLE_MODEL: "article-model",
        OPENAI_MODEL: "legacy",
      }),
      "article-model"
    );
    assert.equal(resolveShortsOpenAiModel({ OPENAI_MODEL: "legacy" }), "legacy");
    assert.equal(resolveShortsOpenAiModel({}), "gpt-4o-mini");
  });
});
