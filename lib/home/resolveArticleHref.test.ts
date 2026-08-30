import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveArticleHref } from "./resolveArticleHref";
import type { HomeArticleCard } from "./types";

function card(
  slug: string,
  partial: Partial<Omit<HomeArticleCard, "slug">> = {}
): HomeArticleCard {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Headline",
    summary: null,
    slug,
    created_at: "2026-08-28T12:00:00.000Z",
    source: "AP",
    category: "politics",
    published_at: "2026-08-28T12:00:00.000Z",
    thumbnail_url: null,
    title_original: "Headline",
    ...partial,
  };
}

describe("resolveArticleHref", () => {
  it("links English-only card on /ko page to /en/article/{slug}", () => {
    const href = resolveArticleHref(
      card("english-only-slug", { locale: "en" }),
      "/ko/article"
    );
    assert.equal(href, "/en/article/english-only-slug");
  });

  it("links Korean-only card on /en page to /ko/article/{slug}", () => {
    const href = resolveArticleHref(
      card("korean-only-slug", { locale: "ko" }),
      "/en/article"
    );
    assert.equal(href, "/ko/article/korean-only-slug");
  });

  it("links Korean card to /ko/article/{slug}", () => {
    const href = resolveArticleHref(
      card("korean-slug", { locale: "ko" }),
      "/ko/article"
    );
    assert.equal(href, "/ko/article/korean-slug");
  });

  it("links English card to /en/article/{slug}", () => {
    const href = resolveArticleHref(
      card("english-slug", { locale: "en" }),
      "/en/article"
    );
    assert.equal(href, "/en/article/english-slug");
  });

  it("keeps articleHrefPrefix when article.locale is absent", () => {
    assert.equal(
      resolveArticleHref(card("legacy-slug"), "/ko/article"),
      "/ko/article/legacy-slug"
    );
    assert.equal(
      resolveArticleHref(card("legacy-slug"), "/en/article"),
      "/en/article/legacy-slug"
    );
  });

  it("prefers articleHrefFor override over locale and prefix", () => {
    const href = resolveArticleHref(
      card("ignored-slug", { locale: "en" }),
      "/ko/article",
      () => "/custom/article/override"
    );
    assert.equal(href, "/custom/article/override");
  });
});
