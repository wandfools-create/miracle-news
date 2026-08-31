import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { englishLabelForSourceKey, localizeSourceLabel } from "@/lib/article/sourceDisplayLabels";
import {
  buildHomeCategoryFilterHref,
  buildHomeSourceFilterHref,
  parseHomeCategoryFilter,
  parseHomeSourceFilter,
} from "@/lib/home/buildHomeFilterHref";
import { buildEditionHomeCard, type EditionHomeMergeEntry } from "@/lib/home/buildEditionHomeCard";
import { buildHomeFilterResults } from "@/lib/home/homeFilterResults";
import { resolveTrendingIssueTitle } from "@/lib/home/resolveTrendingIssueTitle";
import { pickPreviousEditionFeatured } from "@/lib/home/pickPreviousEditionFeatured";
import { prepareEditionHomeSections } from "@/lib/home/prepareEditionHomeSections";
import { buildTodayEdition } from "@/lib/home/todayEdition";
import { resolveArticleHref } from "@/lib/home/resolveArticleHref";
import type { HomeArticleCard } from "@/lib/home/types";

const NOW_AUG31_NOON = Date.parse("2026-08-31T16:00:00.000Z");

function card(partial: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">): HomeArticleCard {
  return {
    title: "title",
    summary: null,
    slug: partial.slug ?? partial.id,
    created_at: "2026-08-30T12:00:00.000Z",
    source: "insight",
    category: "society",
    published_at: partial.published_at ?? "2026-08-30T12:00:00.000Z",
    thumbnail_url: null,
    title_original: "Original",
    rankingTitle: partial.rankingTitle ?? partial.title ?? "title",
    rankingSummary: partial.rankingSummary ?? partial.summary ?? null,
    ...partial,
  };
}

function mergeEntry(
  articleId: string,
  ko?: Partial<EditionHomeMergeEntry["ko"]>,
  en?: Partial<EditionHomeMergeEntry["en"]>
): EditionHomeMergeEntry {
  const base = {
    id: `${articleId}-loc`,
    slug: `${articleId}-slug`,
    created_at: "2026-08-30T12:00:00.000Z",
    is_top_story: false,
    top_story_order: 0,
    title: "Title",
    summary: "Summary",
    contentFields: {
      language_original: "ko",
      title_original: "Original",
      title_ko: "한국어 제목",
      title_translated: "English title",
      summary_original: null,
      summary_ko: "한국어 요약",
      summary_translated: "English summary",
    },
    source: "insight",
    source_country: "KR",
    category: "politics",
    published_at: "2026-08-30T12:00:00.000Z",
    source_published_at: null,
    editorial_priority: "normal",
    editorial_priority_manual: false,
    listDateKo: "8월 30일",
    listDateEn: "Aug 30",
    publishedFullKo: "2026년 8월 30일",
    publishedFullEn: "August 30, 2026",
    searchHaystack: "title summary",
    thumbnail_url: null,
    title_original: "Original",
    original_url: null,
    topic_key: null,
    topic_label: null,
  };
  return {
    article_id: articleId,
    ko: { ...base, ...ko, id: `${articleId}-ko`, slug: ko?.slug ?? "ko-slug" } as EditionHomeMergeEntry["ko"],
    en: { ...base, ...en, id: `${articleId}-en`, slug: en?.slug ?? "en-slug" } as EditionHomeMergeEntry["en"],
  };
}

describe("sourceDisplayLabels", () => {
  it("maps Korean outlet labels to English on EN locale", () => {
    assert.equal(englishLabelForSourceKey("insight"), "Insight");
    assert.equal(localizeSourceLabel("인사이트", "en", "insight"), "Insight");
    assert.equal(localizeSourceLabel("인사이트", "ko", "insight"), "인사이트");
  });
});

describe("buildHomeFilterHref", () => {
  it("builds locale-prefixed filter URLs with canonical keys", () => {
    assert.equal(buildHomeSourceFilterHref("en", "chosun"), "/en?source=chosun");
    assert.equal(buildHomeCategoryFilterHref("ko", "politics"), "/ko?category=politics");
    assert.equal(parseHomeSourceFilter("chosun"), "chosun");
    assert.equal(parseHomeCategoryFilter("politics"), "politics");
  });
});

describe("resolveTrendingIssueTitle", () => {
  it("avoids Korean topic_label on EN pages", () => {
    const title = resolveTrendingIssueTitle(
      card({
        id: "1",
        title: "President announces housing policy",
        topic_key: "housing-policy",
        topic_label: "부동산 정책",
      }),
      "en",
      "부동산 정책"
    );
    assert.equal(title, "President announces housing policy");
  });
});

describe("homeFilterResults", () => {
  it("filters by canonical source and category keys", () => {
    const articles = [
      card({ id: "a1", source: "chosun", category: "politics", article_id: "a1" }),
      card({ id: "a2", source: "insight", category: "society", article_id: "a2" }),
    ];
    const bySource = buildHomeFilterResults(articles, { sourceKey: "chosun" });
    assert.equal(bySource.length, 1);
    assert.equal(bySource[0]?.article_id, "a1");

    const byCategory = buildHomeFilterResults(articles, { categoryKey: "society" });
    assert.equal(byCategory.length, 1);
    assert.equal(byCategory[0]?.article_id, "a2");
  });
});

describe("carryover featured layout", () => {
  it("keeps featured + secondary when todayCount is 0 and prior edition had 2+", () => {
    const prior1 = card({
      id: "p1",
      article_id: "p1",
      published_at: "2026-08-30T14:00:00.000Z",
      title: "Prior lead",
      ai_recommend_grade: "best",
      ai_recommend_score: 90,
    });
    const prior2 = card({
      id: "p2",
      article_id: "p2",
      published_at: "2026-08-30T15:00:00.000Z",
      title: "Prior secondary",
      source: "yonhap",
      ai_recommend_grade: "priority",
      ai_recommend_score: 80,
    });

    const edition = buildTodayEdition([prior1, prior2], { nowMs: NOW_AUG31_NOON, locale: "ko" });
    assert.equal(edition.todayCount, 0);
    assert.equal(edition.status, "carryover");
    assert.ok(edition.featured);
    assert.ok(edition.secondaryFeatured);

    const sections = prepareEditionHomeSections([prior1, prior2], "ko", {
      leftTitle: "L",
      rightTitle: "R",
    }, { nowMs: NOW_AUG31_NOON });

    assert.equal(sections.featuredLeads?.length, 2);
    assert.equal(sections.featuredLeads?.[0]?.article_id, edition.featured?.article_id);
    assert.equal(sections.featuredLeads?.[1]?.article_id, edition.secondaryFeatured?.article_id);
  });
});

describe("locale-neutral featured selection", () => {
  it("picks the same featured and secondary article_id on KO and EN pages", () => {
    const entry = mergeEntry("art-1");
    const koCard = buildEditionHomeCard("ko", entry)!;
    const enCard = buildEditionHomeCard("en", entry)!;

    assert.notEqual(koCard.title, enCard.title);
    assert.equal(koCard.rankingTitle, enCard.rankingTitle);
    assert.equal(koCard.slug, "ko-slug");
    assert.equal(enCard.slug, "en-slug");

    const todayKo = card({
      id: "today-ko",
      article_id: "today-ko",
      published_at: "2026-08-31T10:00:00.000Z",
      title: "오늘 한국어",
      rankingTitle: "오늘 한국어 English today",
      ai_recommend_grade: "best",
      ai_recommend_score: 95,
    });
    const todayEn = card({
      id: "today-en",
      article_id: "today-ko",
      published_at: "2026-08-31T10:00:00.000Z",
      title: "English today",
      rankingTitle: "오늘 한국어 English today",
      slug: "en-slug-today",
      ai_recommend_grade: "best",
      ai_recommend_score: 95,
    });
    const secondaryKo = card({
      id: "sec-ko",
      article_id: "sec-ko",
      published_at: "2026-08-31T11:00:00.000Z",
      title: "보조 한국어",
      rankingTitle: "보조 한국어 Secondary EN",
      source: "yonhap",
      ai_recommend_grade: "priority",
      ai_recommend_score: 80,
    });
    const secondaryEn = card({
      id: "sec-en",
      article_id: "sec-ko",
      published_at: "2026-08-31T11:00:00.000Z",
      title: "Secondary EN",
      rankingTitle: "보조 한국어 Secondary EN",
      slug: "sec-en-slug",
      source: "yonhap",
      ai_recommend_grade: "priority",
      ai_recommend_score: 80,
    });

    const koEdition = buildTodayEdition([todayKo, secondaryKo], {
      nowMs: NOW_AUG31_NOON,
      locale: "ko",
    });
    const enEdition = buildTodayEdition([todayEn, secondaryEn], {
      nowMs: NOW_AUG31_NOON,
      locale: "en",
    });

    assert.equal(koEdition.featured?.article_id, enEdition.featured?.article_id);
    assert.equal(
      koEdition.secondaryFeatured?.article_id,
      enEdition.secondaryFeatured?.article_id
    );
  });
});

describe("article href locale alignment", () => {
  it("uses localization slug with matching locale prefix", () => {
    const koHref = resolveArticleHref(
      card({ id: "1", slug: "ko-slug", locale: "ko" }),
      "/ko/article"
    );
    const enHref = resolveArticleHref(
      card({ id: "1", slug: "en-slug", locale: "en" }),
      "/en/article"
    );
    assert.equal(koHref, "/ko/article/ko-slug");
    assert.equal(enHref, "/en/article/en-slug");
    assert.doesNotMatch(koHref, /\/ko\/article\/en-/);
    assert.doesNotMatch(enHref, /\/en\/article\/ko-/);
  });

  it("validates featured, secondary, trending, and filter hrefs stay locale-aligned", () => {
    const koArticle = card({ id: "k1", slug: "korean-slug", locale: "ko", article_id: "k1" });
    const enArticle = card({ id: "e1", slug: "english-slug", locale: "en", article_id: "e1" });

    for (const href of [
      resolveArticleHref(koArticle, "/ko/article"),
      buildHomeSourceFilterHref("ko", "insight"),
      buildHomeCategoryFilterHref("en", "politics"),
      resolveArticleHref(enArticle, "/en/article"),
    ]) {
      if (href.includes("/ko/article/")) {
        assert.doesNotMatch(href, /\/ko\/article\/english-/);
      }
      if (href.includes("/en/article/")) {
        assert.doesNotMatch(href, /\/en\/article\/korean-/);
      }
    }
  });
});

describe("pickPreviousEditionFeatured", () => {
  it("returns null when no prior edition exists", () => {
    const result = pickPreviousEditionFeatured([], { nowMs: NOW_AUG31_NOON });
    assert.equal(result, null);
  });
});
