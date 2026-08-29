import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RSS_FEED_SOURCES } from "@/lib/rss/feedSources";
import {
  parseJoongangNewsSitemapXml,
  prepareJoongangLatestItems,
} from "@/lib/rss/joongangNewsSitemap";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https://www.joongang.co.kr/article/25457276?source=sitemap</loc>
    <news:news>
      <news:publication><news:name>중앙일보</news:name><news:language>ko</news:language></news:publication>
      <news:publication_date>2026-08-29T12:09:10+09:00</news:publication_date>
      <news:title><![CDATA[대통령, 새 관세 정책 발표…한국 영향은]]></news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.joongang.co.kr/article/25450000</loc>
    <news:news>
      <news:publication_date>2026-08-20T12:00:00+09:00</news:publication_date>
      <news:title>오래된 기사 &amp; 제외 대상</news:title>
    </news:news>
  </url>
  <url>
    <loc>https://example.com/article/1</loc>
    <news:news>
      <news:publication_date>2026-08-29T12:00:00+09:00</news:publication_date>
      <news:title><![CDATA[다른 도메인]]></news:title>
    </news:news>
  </url>
</urlset>`;

describe("JoongAng official latest-news sitemap", () => {
  it("registers joongang as an active Korea publisher", () => {
    const source = RSS_FEED_SOURCES.find((feed) => feed.sourceKey === "joongang");
    assert.ok(source);
    assert.equal(source.fetchKind, "joongang-news-sitemap");
    assert.equal(source.collectRegion, "korea");
    assert.equal(
      source.feedUrl,
      "https://www.joongang.co.kr/sitemap/latest-articles"
    );
  });

  it("parses current JoongAng article URLs and normalizes dates", () => {
    const entries = parseJoongangNewsSitemapXml(FIXTURE);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].loc, "https://www.joongang.co.kr/article/25457276");
    assert.equal(entries[0].publishedAt, "2026-08-29T03:09:10.000Z");
    assert.equal(entries[1].title, "오래된 기사 & 제외 대상");
  });

  it("keeps recent items and skips articles older than 72 hours", () => {
    const result = prepareJoongangLatestItems({
      xml: FIXTURE,
      nowMs: new Date("2026-08-29T04:00:00.000Z").getTime(),
    });
    assert.equal(result.checked, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.items.length, 1);
    assert.match(result.items[0].title, /대통령/);
  });

  it("rejects retired RSS HTML before item preparation", () => {
    assert.deepEqual(
      parseJoongangNewsSitemapXml(
        "<!doctype html><title>서비스 종료 안내</title>"
      ),
      []
    );
    const fetchSource = readFileSync(
      join(process.cwd(), "lib/rss/fetchJoongangLatest.ts"),
      "utf8"
    );
    assert.match(fetchSource, /not_joongang_news_sitemap/);
  });
});
