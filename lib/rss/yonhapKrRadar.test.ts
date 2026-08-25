import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseYonhapNewsSitemapXml } from "./yonhapKrRadarSitemap";
import {
  evaluateYonhapKrRadarTitle,
  guessYonhapRadarCategory,
  selectYonhapRadarClusterRepresentatives,
  YONHAP_KR_RADAR_MAX_INSERTS_PER_RUN,
  YONHAP_KR_RADAR_SITEMAPS,
  YONHAP_KR_RADAR_SOURCE_KEY,
} from "./yonhapKrRadarPolicy";
import { RSS_FEED_SOURCES, isRssFeedSourceEnabled } from "./feedSources";

const FIXTURE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https://www.yna.co.kr/view/AKR20260825000100001</loc>
    <news:news>
      <news:publication><news:name>연합뉴스</news:name><news:language>ko</news:language></news:publication>
      <news:publication_date>2026-08-25T01:00:00+09:00</news:publication_date>
      <news:title><![CDATA[[속보] 美, 이란 핵·석유 연계 단체 등 60개 제재 대상 지정]]></news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.yna.co.kr/view/AKR20260825000200002</loc>
    <news:news>
      <news:publication><news:name>연합뉴스</news:name><news:language>ko</news:language></news:publication>
      <news:publication_date>2026-08-25T01:10:00+09:00</news:publication_date>
      <news:title><![CDATA[[속보] 美재무, 대이란 제재 中포함 여부에 "누구도 제재 못 벗어나"]]></news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.yna.co.kr/view/AKR20260825000300003</loc>
    <news:news>
      <news:publication><news:name>연합뉴스</news:name><news:language>ko</news:language></news:publication>
      <news:publication_date>2026-08-24T12:00:00+09:00</news:publication_date>
      <news:title><![CDATA[프로야구 오늘 경기 결과…롯데 연장 승]]></news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.yna.co.kr/view/AKR20260825000400004</loc>
    <news:news>
      <news:publication><news:name>연합뉴스</news:name><news:language>ko</news:language></news:publication>
      <news:publication_date>2026-08-24T15:00:00+09:00</news:publication_date>
      <news:title><![CDATA[아이돌 열애설에 팬들 술렁]]></news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.yna.co.kr/view/AKR20260825000500005</loc>
    <news:news>
      <news:publication><news:name>연합뉴스</news:name><news:language>ko</news:language></news:publication>
      <news:publication_date>2026-08-24T18:00:00+09:00</news:publication_date>
      <news:title><![CDATA[대통령, 특별감찰관 후보 지명…국회 임명 절차 착수]]></news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.yna.co.kr/view/AKR20260820000600006</loc>
    <news:news>
      <news:publication><news:name>연합뉴스</news:name><news:language>ko</news:language></news:publication>
      <news:publication_date>2026-08-20T10:00:00+09:00</news:publication_date>
      <news:title><![CDATA[[속보] 오래된 속보 샘플]]></news:title>
    </news:news>
  </url>
</urlset>`;

describe("Yonhap KR radar (fixture only, no OpenAI/network body)", () => {
  it("registers radar feed separately from disabled English yonhap", () => {
    assert.equal(isRssFeedSourceEnabled("yonhap"), false);
    const radar = RSS_FEED_SOURCES.find(
      (f) => f.sourceKey === YONHAP_KR_RADAR_SOURCE_KEY
    );
    assert.ok(radar);
    assert.equal(radar.enabled !== false, true);
    assert.equal(radar.fetchKind, "yna-sitemap-radar");
    assert.equal(radar.maxInsertsPerRun, 3);
    assert.equal(radar.label, "연합뉴스 속보");
    assert.equal(YONHAP_KR_RADAR_MAX_INSERTS_PER_RUN, 3);
    assert.equal(YONHAP_KR_RADAR_SITEMAPS.length, 4);
  });

  it("parses news-sitemap fixture entries", () => {
    const entries = parseYonhapNewsSitemapXml(FIXTURE_SITEMAP);
    assert.equal(entries.length, 6);
    assert.equal(
      entries[0].title,
      "[속보] 美, 이란 핵·석유 연계 단체 등 60개 제재 대상 지정"
    );
    assert.ok(entries[0].publishedAt);
    assert.match(entries[0].loc, /AKR20260825000100001$/);
  });

  it("allows 속보 / major politics and skips sports·연예", () => {
    assert.equal(
      evaluateYonhapKrRadarTitle(
        "[속보] 美, 이란 핵·석유 연계 단체 등 60개 제재 대상 지정"
      ).action,
      "allow"
    );
    assert.equal(
      evaluateYonhapKrRadarTitle(
        "대통령, 특별감찰관 후보 지명…국회 임명 절차 착수"
      ).action,
      "allow"
    );
    assert.equal(
      evaluateYonhapKrRadarTitle("프로야구 오늘 경기 결과…롯데 연장 승").action,
      "skip"
    );
    assert.equal(
      evaluateYonhapKrRadarTitle("아이돌 열애설에 팬들 술렁").action,
      "skip"
    );
    assert.equal(
      evaluateYonhapKrRadarTitle("정부 관계자 만찬 행사").action,
      "skip"
    );
  });

  it("collapses same-event 속보 to newest/most specific", () => {
    const kept = selectYonhapRadarClusterRepresentatives([
      {
        title: "[속보] 美, 이란 관련 제재 대상 지정",
        link: "https://www.yna.co.kr/view/AKR1",
        publishedAt: "2026-08-25T01:00:00.000Z",
      },
      {
        title: "[속보] 美, 이란 핵·석유 연계 단체 등 60개 제재 대상 지정 확대",
        link: "https://www.yna.co.kr/view/AKR2",
        publishedAt: "2026-08-25T01:20:00.000Z",
      },
    ]);
    assert.equal(kept.length, 1);
    assert.match(kept[0].link, /AKR2$/);
  });

  it("guesses category from title when possible", () => {
    assert.equal(
      guessYonhapRadarCategory("대통령, 특별감찰관 후보 지명"),
      "politics"
    );
    assert.equal(
      guessYonhapRadarCategory("美, 이란 제재…외교 긴장"),
      "world"
    );
  });
});
