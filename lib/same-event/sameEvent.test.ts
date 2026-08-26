import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifySameEvent,
  isClearSameEvent,
  representativeScore,
  shouldSuppressIncomingSameEvent,
} from "@/lib/same-event/classifySameEvent";
import {
  decideCollectSameEvent,
  evaluatePublishedSameEventGuard,
} from "@/lib/same-event/sameEventDecide";
import { findVerySimilarTitle } from "@/lib/rss/rssTitleSimilarity";
import { significantStoryTokens } from "@/lib/same-event/tokens";

describe("same-event dual guard (fixture only, no OpenAI/RSS/DB)", () => {
  it("keeps Korean 3-char names in significant tokens", () => {
    const tokens = significantStoryTokens(
      '오세훈 "윤리위 정치는 하위 정치"·한동훈 "당 퇴행"…나란히 張 비판'
    );
    assert.ok(tokens.includes("오세훈"));
    assert.ok(tokens.includes("한동훈"));
  });

  it("오세훈 identical-event titles → SAME", () => {
    const c = classifySameEvent(
      {
        title: '오세훈·한동훈, 한 자리서 장동혁 직격…"하위 정치" "당 퇴행해"',
        summary: "국민의힘 내부에서 장동혁 대표 노선을 비판했다.",
        source: "tvchosun",
        publishedAt: "2026-08-26T00:00:00.000Z",
      },
      {
        title: '오세훈 "윤리위 정치는 하위 정치"·한동훈 "당 퇴행"…나란히 張 비판',
        summary: "오세훈 시장과 한동훈이 장동혁을 직격 비판했다.",
        source: "tvchosun",
        publishedAt: "2026-08-25T08:00:00.000Z",
      }
    );
    assert.equal(c.relation, "same_event");
    assert.equal(c.confidence, "high");
    assert.ok(findVerySimilarTitle(
      '오세훈·한동훈, 한 자리서 장동혁 직격…"하위 정치" "당 퇴행해"',
      ['오세훈 "윤리위 정치는 하위 정치"·한동훈 "당 퇴행"…나란히 張 비판']
    ));
  });

  it("이준석 Yonhap radar / Chosun → SAME", () => {
    const c = classifySameEvent(
      {
        title: '[속보] 개혁신당 지도부 총사퇴…"전당대회로 차기 지도부 선출"',
        summary: "개혁신당 이준석 체제 지도부가 총사퇴했다.",
        source: "yonhap-kr-radar",
        publishedAt: "2026-08-26T00:20:00.000Z",
      },
      {
        title: "[단독] 개혁신당 이준석 대표 오늘 사퇴",
        summary: "이준석 개혁신당 대표가 대표직 사퇴를 선언했다.",
        source: "chosun",
        publishedAt: "2026-08-26T00:25:00.000Z",
      }
    );
    assert.equal(c.relation, "same_event");
    assert.ok(isClearSameEvent(c));
  });

  it("US/Canada trade collapse BBC/CSM → SAME", () => {
    const c = classifySameEvent(
      {
        title:
          "After US trade talks collapse, Canadians stand together against economic storm",
        summary:
          "Ottawa digs in after negotiations with Washington collapsed over tariffs.",
        source: "csm",
        publishedAt: "2026-08-25T08:00:00.000Z",
      },
      {
        title:
          "Trump says Canada wants 'benefits' of being US state after trade talks collapse",
        summary:
          "The US president commented after bilateral trade talks collapsed.",
        source: "bbc",
        publishedAt: "2026-08-24T08:00:00.000Z",
      }
    );
    assert.equal(c.relation, "same_event");
    assert.ok(isClearSameEvent(c));
  });

  it("approval rating 40→30 → UPDATE allowed", () => {
    const c = classifySameEvent(
      {
        title: "李대통령 지지율, 첫 30%대 진입…중도·청년층 이탈",
        summary: "지지율이 30%대로 떨어졌다.",
        source: "tvchosun",
        publishedAt: "2026-08-26T00:00:00.000Z",
      },
      {
        title: "李대통령 지지율 40%... 민주당 39.8%로 떨어져",
        summary: "대통령 지지율 40%로 집계됐다.",
        source: "chosun",
        publishedAt: "2026-08-25T08:00:00.000Z",
      }
    );
    assert.equal(c.relation, "update");
  });

  it("death toll increase → UPDATE allowed", () => {
    const c = classifySameEvent(
      {
        title: "Earthquake death toll rises to 39 after aftershocks",
        summary: "Rescuers say 39 people were killed overnight.",
        source: "ap",
        publishedAt: "2026-08-26T10:00:00.000Z",
      },
      {
        title: "Earthquake kills at least 20 in coastal province",
        summary: "Officials confirmed 20 deaths after the quake.",
        source: "bbc",
        publishedAt: "2026-08-26T02:00:00.000Z",
      }
    );
    assert.equal(c.relation, "update");
  });

  it("wildfire outbreak vs arson arrests → DIFFERENT ANGLE", () => {
    const c = classifySameEvent(
      {
        title:
          "Indonesians brave choking smoke to pray for rain as country battles wildfires",
        summary: "Villagers held prayers as wildfires spread across Sumatra.",
        source: "ap",
        publishedAt: "2026-08-25T08:00:00.000Z",
      },
      {
        title:
          "Indonesian police arrest 72 people suspected of starting forest fires",
        summary: "Police said suspects were arrested for alleged arson.",
        source: "pbs-newshour",
        publishedAt: "2026-08-25T09:00:00.000Z",
      }
    );
    assert.equal(c.relation, "different_angle");
  });

  it("incident vs Korea government response → DIFFERENT ANGLE", () => {
    const c = classifySameEvent(
      {
        title: "북한 미사일 발사로 동해안 주민 대피",
        summary: "미사일 발사 발생 직후 주민들이 대피했다.",
        source: "yonhap-kr-radar",
        publishedAt: "2026-08-26T01:00:00.000Z",
      },
      {
        title: "대통령, 북한 미사일 발사에 공식 입장…안보회의 지시",
        summary: "청와대가 정부 반응을 발표하고 대통령이 지시를 내렸다.",
        source: "chosun",
        publishedAt: "2026-08-26T03:00:00.000Z",
      }
    );
    assert.equal(c.relation, "different_angle");
  });

  it("published SAME → publish guard blocks; override path is separate", () => {
    const published = [
      {
        id: "pub-1",
        source: "bbc",
        title_ko: "트럼프, 무역 협상 결렬 후 캐나다 발언",
        title_original:
          "Trump says Canada wants benefits after trade talks collapse",
        title: "트럼프, 무역 협상 결렬 후 캐나다 발언",
        summary: "무역 협상 결렬 이후 트럼프가 캐나다를 언급했다.",
        titleAlt:
          "Trump says Canada wants benefits after trade talks collapse",
        publishedAt: "2026-08-24T12:00:00.000Z",
        published_at: "2026-08-24T12:00:00.000Z",
      },
    ];
    const guard = evaluatePublishedSameEventGuard(
      {
        title:
          "After US trade talks collapse, Canadians stand together against economic storm",
        summary: "Trade talks collapse sparks solidarity in Canada.",
        source: "csm",
      },
      published
    );
    assert.equal(guard.blocked, true);
    if (guard.blocked) {
      assert.equal(guard.match.id, "pub-1");
    }
  });

  it("Yonhap Radar vs Chosun SAME → Chosun preferred; radar suppressed", () => {
    const radar = {
      id: "radar-1",
      source: "yonhap-kr-radar",
      rss_title: "[속보] 개혁신당 지도부 총사퇴",
      title: "[속보] 개혁신당 지도부 총사퇴…이준석 사퇴",
      summary: "개혁신당 이준석 지도부가 총사퇴했다.",
      publishedAt: "2026-08-26T00:20:00.000Z",
    };
    const chosunIncoming = {
      title: "[단독] 개혁신당 이준석 대표 오늘 사퇴",
      summary: "이준석 대표가 개혁신당 대표직 사퇴를 발표했다.",
      source: "chosun",
      publishedAt: "2026-08-26T00:25:00.000Z",
    };

    // Incoming Chosun should NOT be suppressed vs weaker radar existing
    const allowChosun = decideCollectSameEvent(chosunIncoming, [radar]);
    assert.equal(allowChosun.action, "allow");
    assert.ok(
      representativeScore(chosunIncoming) > representativeScore(radar)
    );

    // Incoming radar SHOULD be suppressed when Chosun already exists
    const chosunExisting = {
      id: "chosun-1",
      source: "chosun",
      rss_title: chosunIncoming.title,
      title: chosunIncoming.title,
      summary: chosunIncoming.summary,
      publishedAt: chosunIncoming.publishedAt,
    };
    const suppressRadar = decideCollectSameEvent(
      {
        title: radar.title,
        summary: radar.summary,
        source: "yonhap-kr-radar",
        publishedAt: radar.publishedAt,
      },
      [chosunExisting]
    );
    assert.equal(suppressRadar.action, "suppress");

    const classification = classifySameEvent(chosunIncoming, radar);
    assert.ok(
      shouldSuppressIncomingSameEvent(radar, chosunIncoming, classification)
    );
  });

  it("ambiguous / UPDATE never suppress on collect", () => {
    const decision = decideCollectSameEvent(
      {
        title: "李대통령 지지율, 첫 30%대 진입",
        summary: "지지율 30%",
        source: "tvchosun",
        publishedAt: "2026-08-26T00:00:00.000Z",
      },
      [
        {
          id: "c1",
          source: "chosun",
          rss_title: "李대통령 지지율 40%",
          title: "李대통령 지지율 40%... 민주당 39.8%로 떨어져",
          summary: "지지율 40%",
          publishedAt: "2026-08-25T08:00:00.000Z",
        },
      ]
    );
    assert.equal(decision.action, "allow");
  });
});
