import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEditionHomeCard, type EditionHomeMergeEntry } from "./buildEditionHomeCard";
import {
  compareHomePublishedArticles,
  selectHomePublishedArticleIds,
  simulateLegacyLocalePoolArticleIds,
} from "./homePublishedArticleSort";
import { HOME_PUBLISHED_FETCH_LIMIT } from "./publishedFetchLimits";
import { resolveArticleHref } from "./resolveArticleHref";

const AUDIT_ARTICLE_IDS = [
  "4cdde603-0000-4000-8000-000000000001",
  "acf8343e-0000-4000-8000-000000000002",
  "f0290eb4-0000-4000-8000-000000000003",
  "17815d7c-0000-4000-8000-000000000004",
  "f380436a-0000-4000-8000-000000000005",
];

type LocalizationSlice = NonNullable<EditionHomeMergeEntry["ko"]>;

function articleSortRow(
  id: string,
  sourcePublishedAt: string | null,
  publishedAt: string | null = sourcePublishedAt
) {
  return { id, source_published_at: sourcePublishedAt, published_at: publishedAt };
}

function localizationSlice(
  slug: string,
  lang: "ko" | "en",
  id = `${lang}-${slug.slice(0, 8)}`
): LocalizationSlice {
  return {
    id,
    slug,
    created_at: "2026-08-28T12:00:00.000Z",
    is_top_story: false,
    top_story_order: 0,
    title: lang === "ko" ? `KO ${slug.slice(0, 12)}` : `EN ${slug.slice(0, 12)}`,
    summary: null,
    contentFields: {
      language_original: lang,
      title_original: "Original",
      title_ko: lang === "ko" ? "KO title" : null,
      title_translated: lang === "en" ? "EN title" : null,
      summary_original: null,
      summary_ko: null,
      summary_translated: null,
    },
    source: "AP",
    source_country: "US",
    category: "politics",
    published_at: "2026-08-28T12:00:00.000Z",
    source_published_at: "2026-08-28T12:00:00.000Z",
    editorial_priority: "normal",
    thumbnail_url: null,
    title_original: "Original",
    original_url: null,
    topic_key: null,
    topic_label: null,
  };
}

function bilingualEntry(articleId: string, koSlug: string, enSlug: string): EditionHomeMergeEntry {
  return {
    article_id: articleId,
    ko: localizationSlice(koSlug, "ko"),
    en: localizationSlice(enSlug, "en"),
  };
}

function legacyLocalizationRows(
  articles: ReturnType<typeof articleSortRow>[]
): Array<
  ReturnType<typeof articleSortRow> & {
    locale: "ko" | "en";
    article_id: string;
  }
> {
  return articles.flatMap((article) => [
    { ...article, article_id: article.id, locale: "ko" as const },
    { ...article, article_id: article.id, locale: "en" as const },
  ]);
}

describe("homePublishedArticleSort", () => {
  it("breaks ties with article_id descending", () => {
    const ts = "2026-08-28T12:00:00.000Z";
    const ids = selectHomePublishedArticleIds(
      [
        articleSortRow("aaaaaaaa-0000-4000-8000-000000000001", ts),
        articleSortRow("bbbbbbbb-0000-4000-8000-000000000002", ts),
        articleSortRow("cccccccc-0000-4000-8000-000000000003", ts),
      ],
      3
    );
    assert.deepEqual(ids, [
      "cccccccc-0000-4000-8000-000000000003",
      "bbbbbbbb-0000-4000-8000-000000000002",
      "aaaaaaaa-0000-4000-8000-000000000001",
    ]);
  });

  it("returns at most 200 unique article ids for 205 candidates", () => {
    const articles = Array.from({ length: 205 }, (_, index) => {
      const hex = index.toString(16).padStart(12, "0");
      return articleSortRow(
        `${String(index + 1).padStart(2, "0")}aaaaaa-4000-8000-${hex}`,
        `2026-08-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`
      );
    });
    const ids = selectHomePublishedArticleIds(articles, HOME_PUBLISHED_FETCH_LIMIT);
    assert.equal(ids.length, 200);
    assert.equal(new Set(ids).size, 200);
  });

  it("orders selected ids by source_published_at then published_at then id", () => {
    const ordered = selectHomePublishedArticleIds(
      [
        articleSortRow("id-001", "2026-08-20T00:00:00.000Z"),
        articleSortRow("id-002", "2026-08-25T00:00:00.000Z", "2026-08-24T00:00:00.000Z"),
        articleSortRow("id-003", "2026-08-25T00:00:00.000Z", "2026-08-26T00:00:00.000Z"),
      ],
      3
    );
    assert.deepEqual(ordered, ["id-003", "id-002", "id-001"]);
    assert.ok(
      compareHomePublishedArticles(
        articleSortRow("id-003", "2026-08-25T00:00:00.000Z", "2026-08-26T00:00:00.000Z"),
        articleSortRow("id-002", "2026-08-25T00:00:00.000Z", "2026-08-24T00:00:00.000Z")
      ) < 0
    );
  });
});

describe("fetchEditionHomeArticlePool selection", () => {
  it("selects the same 200 article ids for unified hydration with bilingual data", () => {
    const articles = Array.from({ length: 205 }, (_, index) => {
      const hex = index.toString(16).padStart(12, "0");
      return articleSortRow(
        `${String(index + 1).padStart(2, "0")}aaaaaa-4000-8000-${hex}`,
        `2026-08-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`
      );
    });
    const selectedIds = selectHomePublishedArticleIds(
      articles,
      HOME_PUBLISHED_FETCH_LIMIT
    );

    const entries = new Map(
      selectedIds.map((articleId) => [
        articleId,
        bilingualEntry(articleId, `ko-${articleId.slice(0, 8)}`, `en-${articleId.slice(0, 8)}`),
      ])
    );

    for (const articleId of selectedIds) {
      const entry = entries.get(articleId);
      assert.ok(entry?.ko);
      assert.ok(entry?.en);
    }
  });

  it("reproduces legacy dual-limit asymmetry and fixes it with unified ids", () => {
    const sharedTs = "2026-08-28T12:00:00.000Z";
    const articles = Array.from({ length: 205 }, (_, index) => {
      const hex = index.toString(16).padStart(12, "0");
      return articleSortRow(
        `${String(index + 1).padStart(2, "0")}bbbbbb-4000-8000-${hex}`,
        sharedTs
      );
    });
    const localizationRows = legacyLocalizationRows(articles);

    const koLegacy = simulateLegacyLocalePoolArticleIds(
      localizationRows,
      "ko",
      HOME_PUBLISHED_FETCH_LIMIT,
      { legacyTimestampSort: true, unstableTieBreak: true }
    );
    const enLegacy = simulateLegacyLocalePoolArticleIds(
      localizationRows,
      "en",
      HOME_PUBLISHED_FETCH_LIMIT,
      { legacyTimestampSort: true, unstableTieBreak: true }
    );
    const legacyEnNotKo = [...enLegacy].filter((id) => !koLegacy.has(id));
    assert.ok(legacyEnNotKo.length > 0, "legacy pools should diverge at tied timestamps");

    const unifiedIds = selectHomePublishedArticleIds(articles, HOME_PUBLISHED_FETCH_LIMIT);
    for (const articleId of legacyEnNotKo) {
      if (!unifiedIds.includes(articleId)) continue;
      const entry = bilingualEntry(
        articleId,
        `ko-${articleId.slice(0, 8)}`,
        `en-${articleId.slice(0, 8)}`
      );
      assert.ok(entry.ko);
      assert.ok(entry.en);
    }
  });

  it("includes both locales for audit-shaped bilingual articles", () => {
    const sharedTs = "2026-08-29T12:00:00.000Z";
    const articles = AUDIT_ARTICLE_IDS.map((id) => articleSortRow(id, sharedTs));
    const unifiedIds = selectHomePublishedArticleIds(articles, HOME_PUBLISHED_FETCH_LIMIT);

    for (const articleId of AUDIT_ARTICLE_IDS) {
      assert.ok(unifiedIds.includes(articleId));
      const entry = bilingualEntry(
        articleId,
        `ko-slug-${articleId.slice(0, 8)}`,
        `en-slug-${articleId.slice(0, 8)}`
      );

      const koCard = buildEditionHomeCard("ko", entry);
      const enCard = buildEditionHomeCard("en", entry);
      assert.ok(koCard);
      assert.ok(enCard);
      assert.equal(koCard.locale, "ko");
      assert.equal(koCard.slug, `ko-slug-${articleId.slice(0, 8)}`);
      assert.equal(enCard.locale, "en");
      assert.equal(enCard.slug, `en-slug-${articleId.slice(0, 8)}`);
      assert.equal(
        resolveArticleHref(koCard, "/ko/article"),
        `/ko/article/ko-slug-${articleId.slice(0, 8)}`
      );
      assert.equal(
        resolveArticleHref(enCard, "/en/article"),
        `/en/article/en-slug-${articleId.slice(0, 8)}`
      );
    }
  });

  it("keeps KO-only and EN-only fallbacks", () => {
    const koOnlyCard = buildEditionHomeCard("en", {
      article_id: "ko-only-0000-4000-8000-000000000001",
      ko: localizationSlice("ko-only-slug", "ko"),
    });
    const enOnlyCard = buildEditionHomeCard("ko", {
      article_id: "en-only-0000-4000-8000-000000000002",
      en: localizationSlice("en-only-slug", "en"),
    });

    assert.ok(koOnlyCard);
    assert.ok(enOnlyCard);
    assert.equal(koOnlyCard.locale, "ko");
    assert.equal(koOnlyCard.slug, "ko-only-slug");
    assert.equal(enOnlyCard.locale, "en");
    assert.equal(enOnlyCard.slug, "en-only-slug");
    assert.equal(
      resolveArticleHref(enOnlyCard, "/ko/article"),
      "/en/article/en-only-slug"
    );
  });
});
