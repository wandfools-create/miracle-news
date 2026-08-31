import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { englishLabelForSourceKey, localizeSourceLabel } from "@/lib/article/sourceDisplayLabels";
import {
  buildHomeCategoryFilterHref,
  buildHomeSourceFilterHref,
} from "@/lib/home/buildHomeFilterHref";
import { resolveTrendingIssueTitle } from "@/lib/home/resolveTrendingIssueTitle";
import { pickPreviousEditionFeatured } from "@/lib/home/pickPreviousEditionFeatured";
import type { HomeArticleCard } from "@/lib/home/types";

function card(partial: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id">): HomeArticleCard {
  return {
    title: "title",
    summary: null,
    slug: "slug",
    created_at: "2026-08-30T12:00:00.000Z",
    source: "insight",
    category: "society",
    published_at: "2026-08-30T12:00:00.000Z",
    thumbnail_url: null,
    title_original: "Original",
    ...partial,
  };
}

describe("sourceDisplayLabels", () => {
  it("maps Korean outlet labels to English on EN locale", () => {
    assert.equal(englishLabelForSourceKey("insight"), "Insight");
    assert.equal(
      localizeSourceLabel("인사이트", "en", "insight"),
      "Insight"
    );
    assert.equal(localizeSourceLabel("인사이트", "ko", "insight"), "인사이트");
  });
});

describe("buildHomeFilterHref", () => {
  it("builds locale-prefixed filter URLs", () => {
    assert.equal(
      buildHomeSourceFilterHref("en", "chosun"),
      "/en?source=chosun"
    );
    assert.equal(
      buildHomeCategoryFilterHref("ko", "politics"),
      "/ko?category=politics"
    );
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

describe("pickPreviousEditionFeatured", () => {
  it("returns null when no prior edition exists", () => {
    const nowMs = Date.parse("2026-08-31T12:00:00.000Z");
    const result = pickPreviousEditionFeatured([], { nowMs });
    assert.equal(result, null);
  });
});
