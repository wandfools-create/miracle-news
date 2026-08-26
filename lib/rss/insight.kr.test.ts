/**
 * Insight Korea section-list collect — fixture only (no network / OpenAI / DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifySameEvent,
  representativeScore,
} from "@/lib/same-event/classifySameEvent";
import { decideCollectSameEvent } from "@/lib/same-event/sameEventDecide";
import { sameEventSourceTrust } from "@/lib/same-event/sourceTrust";
import {
  getActiveRssFeedSources,
  RSS_FEED_SOURCES,
} from "@/lib/rss/feedSources";
import {
  insightSectionFromFeedUrl,
  parseInsightSectionListHtml,
} from "@/lib/rss/fetchInsightSectionList";
import { getInsightCollectionSkipReason } from "@/lib/rss/insightCollectionPolicy";
import { getRssItemSkipReason } from "@/lib/rss/rssItemPrefilter";
import { COLLECT_REGION_KOREA } from "@/lib/rss/collectRegions";

const FIXTURE_LIST_HTML = `
<html><body>
<article class="main-section-list-item" itemscope itemtype="https://schema.org/NewsArticle">
  <div class="main-section-list-item-info">
    <header class="main-section-list-item-info-title">
      <h2 itemprop="headline">
        <a href="https://www.insight.co.kr/news/570044" itemprop="url">
          국회, 예산안 본회의 처리 합의
        </a>
      </h2>
    </header>
    <div class="main-section-list-item-info-summary" itemprop="description">
      <p>여야가 내년도 예산안을 본회의에서 처리하기로 합의했다.</p>
    </div>
    <div class="main-section-list-item-info-pipe">
      <time class="main-section-list-item-info-pipe-time" datetime="2026-08-25T21:34:15+09:00">13시간 전</time>
    </div>
  </div>
  <figure class="main-section-list-item-image" itemprop="image" itemscope itemtype="https://schema.org/ImageObject">
    <a href="https://www.insight.co.kr/news/570044" itemprop="url">
      <img src="https://img.insight.co.kr/static/2026/08/25/thumb.jpg" alt="국회" itemprop="contentUrl" />
    </a>
  </figure>
</article>
<article class="main-section-list-item" itemscope itemtype="https://schema.org/NewsArticle">
  <div class="main-section-list-item-info">
    <header class="main-section-list-item-info-title">
      <h2 itemprop="headline">
        <a href="https://www.insight.co.kr/news/570099" itemprop="url">아이돌 열애설, 팬미팅서 깜짝 결혼 인정</a>
      </h2>
    </header>
    <div class="main-section-list-item-info-summary" itemprop="description">
      <p>걸그룹 멤버가 열애설을 인정했다.</p>
    </div>
  </div>
</article>
</body></html>
`;

describe("Insight Korea collect (fixture only)", () => {
  it("registers four section-list feeds with desk categories", () => {
    const feeds = RSS_FEED_SOURCES.filter((f) => f.sourceKey === "insight");
    assert.equal(feeds.length, 4);
    assert.ok(feeds.every((f) => f.fetchKind === "insight-section-list"));
    assert.ok(feeds.every((f) => f.collectRegion === COLLECT_REGION_KOREA));
    assert.deepEqual(
      feeds.map((f) => f.category),
      ["politics", "economy", "society", "world"]
    );
    assert.deepEqual(
      feeds.map((f) => insightSectionFromFeedUrl(f.feedUrl)),
      ["politics", "economy", "national", "global"]
    );
    assert.equal(
      getActiveRssFeedSources(COLLECT_REGION_KOREA).filter(
        (f) => f.sourceKey === "insight"
      ).length,
      4
    );
  });

  it("parses NewsArticle list cards into candidate metadata", () => {
    const items = parseInsightSectionListHtml(FIXTURE_LIST_HTML);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.link, "https://www.insight.co.kr/news/570044");
    assert.match(items[0]?.title ?? "", /국회/);
    assert.match(items[0]?.summary ?? "", /예산안/);
    assert.equal(items[0]?.publishedAt, "2026-08-25T21:34:15+09:00");
    assert.equal(
      items[0]?.thumbnailUrl,
      "https://img.insight.co.kr/static/2026/08/25/thumb.jpg"
    );
  });

  it("keeps politics/economy/society/world and skips gossip/sports/lifestyle", () => {
    const keep = [
      {
        title: "국회, 예산안 본회의 처리 합의",
        summary: "여야가 내년도 예산안을 처리하기로 했다.",
        url: "https://www.insight.co.kr/news/1",
      },
      {
        title: "한국은행, 기준금리 동결",
        summary: "금융통화위원회가 금리를 동결했다.",
        url: "https://www.insight.co.kr/news/2",
      },
      {
        title: "서울 지하철 파업 예고",
        summary: "노조가 내일부터 파업에 돌입한다고 밝혔다.",
        url: "https://www.insight.co.kr/news/3",
      },
      {
        title: "미·중 정상, 안보 협의 재개",
        summary: "양국이 국제 안보 현안을 논의했다.",
        url: "https://www.insight.co.kr/news/4",
      },
    ];
    for (const row of keep) {
      assert.equal(getInsightCollectionSkipReason(row), null);
      assert.equal(getRssItemSkipReason("insight", row), null);
    }

    assert.ok(
      getRssItemSkipReason("insight", {
        title: "아이돌 열애설, 팬미팅서 깜짝 결혼 인정",
        url: "https://www.insight.co.kr/news/99",
        summary: "걸그룹 멤버가 열애설을 인정했다.",
      })
    );

    const sports = getRssItemSkipReason("insight", {
      title: "프로야구 경기결과, LG 2연승",
      url: "https://www.insight.co.kr/news/88",
      summary: "오늘 경기에서 LG가 승리했다.",
    });
    assert.ok(sports);

    const lifestyle = getInsightCollectionSkipReason({
      title: "주말 맛집 여행 코스 꿀팁",
      summary: "라이프스타일 쇼핑 팁을 모았다.",
      url: "https://www.insight.co.kr/news/77",
    });
    assert.ok(lifestyle);
    assert.equal(lifestyle.code, "insight_lifestyle");
  });

  it("SAME EVENT: Insight vs Chosun suppress; Insight beats radar; ANGLE allow", () => {
    assert.ok(
      sameEventSourceTrust("insight") > sameEventSourceTrust("yonhap-kr-radar")
    );

    const chosunExisting = {
      id: "c1",
      source: "chosun",
      rss_title: "국회 예산안 본회의 처리 합의",
      title: "국회 예산안 본회의 처리 합의",
      summary: "여야가 예산안을 본회의에서 처리하기로 했다.",
      publishedAt: "2026-08-25T12:00:00.000Z",
      hasThumbnail: true,
    };
    const sameVsChosun = decideCollectSameEvent(
      {
        title: "국회, 예산안 본회의 처리 합의",
        summary: "여야가 내년도 예산안을 본회의에서 처리하기로 합의했다.",
        source: "insight",
        publishedAt: "2026-08-25T12:10:00.000Z",
        hasThumbnail: true,
      },
      [chosunExisting]
    );
    assert.equal(sameVsChosun.action, "suppress");

    const radarExisting = {
      id: "r1",
      source: "yonhap-kr-radar",
      rss_title: "[속보] 개혁신당 지도부 총사퇴",
      title: "[속보] 개혁신당 지도부 총사퇴…이준석 사퇴",
      summary: "개혁신당 이준석 지도부가 총사퇴했다.",
      publishedAt: "2026-08-26T00:20:00.000Z",
    };
    const insightIncoming = {
      title: "[단독] 개혁신당 이준석 대표 오늘 사퇴",
      summary: "이준석 대표가 개혁신당 대표직 사퇴를 발표했다.",
      source: "insight",
      publishedAt: "2026-08-26T00:25:00.000Z",
      hasThumbnail: true,
    };
    const vsRadar = decideCollectSameEvent(insightIncoming, [radarExisting]);
    assert.equal(vsRadar.action, "allow");
    assert.ok(
      representativeScore(insightIncoming) > representativeScore(radarExisting)
    );

    const angle = classifySameEvent(
      {
        title: "대통령, 북한 미사일 발사에 공식 입장…안보회의 지시",
        summary: "청와대가 정부 반응을 발표하고 대통령이 지시를 내렸다.",
        source: "insight",
        publishedAt: "2026-08-26T03:00:00.000Z",
      },
      {
        title: "북한 미사일 발사로 동해안 주민 대피",
        summary: "미사일 발사 발생 직후 주민들이 대피했다.",
        source: "tvchosun",
        publishedAt: "2026-08-26T01:00:00.000Z",
      }
    );
    assert.equal(angle.relation, "different_angle");
  });
});
