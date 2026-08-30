import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEditionHomeCard } from "./buildEditionHomeCard";
import { resolveArticleHref } from "./resolveArticleHref";
import type { ArticleEditionLocale } from "./types";

const EN_SLUG =
  "korean-partys-love-calls-to-lee-myung-bak-and-park-geun-hye-uncertainty-in-achieving-conservative-unity-acf8343e";
const KO_SLUG = "국힘-mb박근혜-잇단-러브콜-보수-대통합-성공-가능성-미지수-acf8343e";
const EN_ONLY_SLUG = "english-only-slug-f0290eb4";
const KO_ONLY_SLUG = "레닌-모레노-부패-혐의로-수감-f0290eb4";

type LocalizationRow = NonNullable<
  Parameters<typeof buildEditionHomeCard>[1]["ko"]
>;

function localizationRow(
  slug: string,
  lang: "ko" | "en",
  id = `${lang}-${slug.slice(0, 8)}`
): LocalizationRow {
  return {
    id,
    slug,
    created_at: "2026-08-28T12:00:00.000Z",
    is_top_story: false,
    top_story_order: 0,
    title: lang === "ko" ? "한국어 제목" : "English headline",
    summary: lang === "ko" ? "한국어 요약" : "English summary",
    contentFields: {
      language_original: lang,
      title_original: "Original headline",
      title_ko: lang === "ko" ? "한국어 제목" : null,
      title_translated: lang === "en" ? "English headline" : null,
      summary_original: null,
      summary_ko: lang === "ko" ? "한국어 요약" : null,
      summary_translated: lang === "en" ? "English summary" : null,
    },
    source: "AP",
    source_country: "US",
    category: "politics",
    published_at: "2026-08-28T12:00:00.000Z",
    source_published_at: "2026-08-28T12:00:00.000Z",
    editorial_priority: "normal",
    thumbnail_url: null,
    title_original: "Original headline",
    original_url: null,
    topic_key: null,
    topic_label: null,
  };
}

function bilingualEntry(articleId = "acf8343e-0000-4000-8000-000000000000") {
  return {
    article_id: articleId,
    ko: localizationRow(KO_SLUG, "ko"),
    en: localizationRow(EN_SLUG, "en"),
  };
}

function assertHref(
  card: NonNullable<ReturnType<typeof buildEditionHomeCard>>,
  displayLocale: ArticleEditionLocale,
  expectedHref: string
) {
  const prefix = displayLocale === "ko" ? "/ko/article" : "/en/article";
  assert.equal(resolveArticleHref(card, prefix), expectedHref);
}

describe("buildEditionHomeCard", () => {
  it("uses EN row on /en when both KO and EN localizations exist", () => {
    const card = buildEditionHomeCard("en", bilingualEntry());
    assert.ok(card);
    assert.equal(card.locale, "en");
    assert.equal(card.slug, EN_SLUG);
    assertHref(card, "en", `/en/article/${EN_SLUG}`);
  });

  it("uses KO row on /ko when both KO and EN localizations exist", () => {
    const card = buildEditionHomeCard("ko", bilingualEntry());
    assert.ok(card);
    assert.equal(card.locale, "ko");
    assert.equal(card.slug, KO_SLUG);
    assertHref(card, "ko", `/ko/article/${KO_SLUG}`);
  });

  it("uses EN row on /ko when only EN localization exists", () => {
    const card = buildEditionHomeCard("ko", {
      article_id: "en-only-ko-page",
      en: localizationRow(EN_ONLY_SLUG, "en"),
    });
    assert.ok(card);
    assert.equal(card.locale, "en");
    assert.equal(card.slug, EN_ONLY_SLUG);
    assertHref(card, "ko", `/en/article/${EN_ONLY_SLUG}`);
  });

  it("uses KO row on /en when only KO localization exists", () => {
    const card = buildEditionHomeCard("en", {
      article_id: "ko-only",
      ko: localizationRow(KO_ONLY_SLUG, "ko"),
    });
    assert.ok(card);
    assert.equal(card.locale, "ko");
    assert.equal(card.slug, KO_ONLY_SLUG);
    assertHref(card, "en", `/ko/article/${KO_ONLY_SLUG}`);
  });

  it("never pairs locale=ko with EN slug or locale=en with KO slug", () => {
    const cases = [
      buildEditionHomeCard("ko", bilingualEntry()),
      buildEditionHomeCard("en", bilingualEntry()),
      buildEditionHomeCard("ko", {
        article_id: "en-only",
        en: localizationRow(EN_ONLY_SLUG, "en"),
      }),
      buildEditionHomeCard("en", {
        article_id: "ko-only",
        ko: localizationRow(KO_ONLY_SLUG, "ko"),
      }),
    ];

    for (const card of cases) {
      assert.ok(card);
      if (card.locale === "ko") {
        assert.notEqual(card.slug, EN_SLUG);
        assert.notEqual(card.slug, EN_ONLY_SLUG);
      }
      if (card.locale === "en") {
        assert.notEqual(card.slug, KO_SLUG);
        assert.notEqual(card.slug, KO_ONLY_SLUG);
      }
    }
  });
});
