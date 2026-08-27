/**
 * Editorial policy fixtures — no OpenAI / DB / Discord / RSS.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBalanceBriefing,
  containsAvoidedBalancePhrase,
  MISSING_VIEWPOINT_LABEL,
} from "./balanceBriefing";
import { repairHomeCategory } from "./homeCategoryRepair";
import {
  estimateEditorialInflow,
  projectPeBiasedInflow,
} from "./inflowEstimate";
import {
  adviseShortsSelection,
  countPoliticsEconomyArticles,
  shortsDeskFitScore,
} from "./shortsSelection";
import {
  describeViewpointAngle,
  detectEditorialBeat,
  homePolicyPoints,
  isCorporatePromoOrThinMarket,
  isMegaEvent,
  isSoftNews,
  isTrivialPoliticalRemark,
  isUsPolicyRelevantForKorea,
  policyGradeNudge,
  policyScoreDelta,
  VIEWPOINT_NEEDS_LABEL,
} from "./signals";
import { applyAiRecommendPostProcess } from "@/lib/collection-candidates/candidateRecommendPostProcess";
import { computeEditorialScore } from "@/lib/home/editorialRanking";
import type { HomeArticleCard } from "@/lib/home/types";
import { SHORTS_EDITORIAL_RULES } from "@/lib/shorts/shortsPolicy";

const NOW = Date.parse("2026-08-27T18:00:00.000Z");

function card(
  overrides: Partial<HomeArticleCard> & Pick<HomeArticleCard, "id" | "title">
): HomeArticleCard {
  return {
    summary: "",
    slug: overrides.id,
    created_at: new Date(NOW - 3600_000).toISOString(),
    source: "AP",
    category: "politics",
    published_at: new Date(NOW - 3600_000).toISOString(),
    source_published_at: new Date(NOW - 3600_000).toISOString(),
    thumbnail_url: null,
    title_original: overrides.title,
    source_country: "US",
    ...overrides,
  };
}

describe("editorial policy signals", () => {
  it("ranks Fed rate / tariff above royal soft news", () => {
    const fed = {
      title: "Federal Reserve holds rates as inflation stays sticky",
      summary: "FOMC decision and US CPI outlook",
    };
    const royal = {
      title: "Prince Harry and Meghan arrive in the UK",
      summary: "Celebrity lifestyle coverage",
    };
    assert.equal(detectEditorialBeat(fed), "us_politics_economy");
    assert.equal(detectEditorialBeat(royal), "soft_news");
    assert.ok(homePolicyPoints(fed) > homePolicyPoints(royal));
  });

  it("keeps trivial political remarks below mega disasters", () => {
    const chatter = {
      title: "Senator hints at maybe considering a rumor in Congress",
      summary: "speculation and unnamed source says",
    };
    const quake = {
      title: "Earthquake and flood leave hundreds dead",
      summary: "mass casualties and evacuations underway",
    };
    assert.equal(isTrivialPoliticalRemark(chatter), true);
    assert.equal(isMegaEvent(quake), true);
    assert.ok(homePolicyPoints(quake) > homePolicyPoints(chatter));
    assert.equal(policyGradeNudge("best", 90, chatter).grade, "priority");
  });

  it("does not promote celebrity gossip with incidental politics to priority", () => {
    const gossip = {
      title: "Celebrity attends White House dinner red carpet",
      summary: "gossip and lifestyle tips from idol fans",
    };
    assert.equal(isSoftNews(gossip), true);
    assert.equal(detectEditorialBeat(gossip), "soft_news");
    const nudged = policyGradeNudge("priority", 80, gossip);
    assert.equal(nudged.grade, "low");
  });

  it("blocks corporate promo / thin market from best", () => {
    const promo = {
      title: "Our company is proud to announce a new product launch",
      summary: "press release brand campaign",
    };
    assert.equal(isCorporatePromoOrThinMarket(promo), true);
    assert.equal(policyGradeNudge("best", 95, promo).grade, "normal");
  });

  it("flags US policy relevance for Korean readers separately", () => {
    assert.equal(
      isUsPolicyRelevantForKorea({
        title: "US semiconductor tariff risks for Samsung and SK Hynix",
        summary: "Washington trade policy and Korea chip exports",
      }),
      true
    );
    assert.equal(
      isUsPolicyRelevantForKorea({
        title: "Local Ohio city council parking debate",
        summary: "municipal zoning only",
      }),
      false
    );
  });

  it("does not assert viewpoint from outlet brand alone", () => {
    assert.equal(
      describeViewpointAngle({
        title: "Markets open mixed in New York",
        summary: "stocks edged higher",
        source: "fox-news",
      }),
      VIEWPOINT_NEEDS_LABEL
    );
    assert.match(
      describeViewpointAngle({
        title: "White House said tariffs will proceed",
        summary: "officials said the administration will move ahead",
      }),
      /정부·당국 설명으로 읽힘/
    );
  });

  it("soft-news penalty demotes AI priority in post-process", () => {
    const out = applyAiRecommendPostProcess([
      {
        id: "1",
        grade: "priority",
        score: 80,
        reason: "관심",
        title: "Prince Harry and Meghan red carpet appearance",
        summary: "celebrity gossip lifestyle",
        source: "ap",
        rssPublishedAt: new Date(NOW).toISOString(),
      },
      {
        id: "2",
        grade: "normal",
        score: 70,
        reason: "금리",
        title: "Federal Reserve signals higher-for-longer rates",
        summary: "inflation and employment data",
        source: "reuters",
        rssPublishedAt: new Date(NOW).toISOString(),
      },
    ]);
    const royal = out.find((x) => x.id === "1")!;
    const fed = out.find((x) => x.id === "2")!;
    assert.ok(royal.grade === "low" || royal.grade === "normal");
    assert.ok(fed.score >= 70);
  });
});

describe("home policy + category repair", () => {
  it("boosts US rates over soft news inside editorial score", () => {
    const rates = card({
      id: "rates",
      title: "Fed holds rates as US inflation stays elevated",
      ai_recommend_grade: "priority",
      ai_recommend_score: 70,
      category: "economy",
    });
    const soft = card({
      id: "soft",
      title: "Prince Harry and Meghan arrive in Britain",
      ai_recommend_grade: "priority",
      ai_recommend_score: 70,
      category: "other",
    });
    assert.ok(
      computeEditorialScore(rates, NOW).total >
        computeEditorialScore(soft, NOW).total
    );
  });

  it("repairs other misclassification for politics titles", () => {
    assert.equal(
      repairHomeCategory({
        category: "other",
        title: "국회, 예산안 처리 본회의 일정 확정",
        summary: "여야 합의",
        source: "yonhap",
      }),
      "politics"
    );
  });
});

describe("shorts editorial advice", () => {
  it("recommends politics/economy majority without forcing fill", () => {
    const pack = [
      { title: "Fed holds rates", summary: "inflation" },
      { title: "White House tariff plan", summary: "trade" },
      { title: "Prince Harry returns", summary: "royal lifestyle" },
      { title: "K-pop idol comeback", summary: "celebrity" },
      { title: "Movie box office", summary: "entertainment" },
    ];
    const advice = adviseShortsSelection(pack, "morning");
    assert.equal(countPoliticsEconomyArticles(pack), 2);
    assert.equal(advice.politicsEconomyMajorityRecommended, false);
    assert.ok(advice.warnings.some((w) => w.includes("과반")));
    assert.ok(advice.warnings.some((w) => w.includes("억지로 채우지")));
    assert.ok(advice.notes.some((n) => n.includes("자동 공개")));
    assert.equal(SHORTS_EDITORIAL_RULES.humanReviewRequired, true);
    assert.equal(SHORTS_EDITORIAL_RULES.autoPublishForbidden, true);
  });

  it("scores morning US fit above soft news", () => {
    assert.ok(
      shortsDeskFitScore(
        { title: "Federal Reserve rate decision", summary: "CPI" },
        "morning"
      ) >
        shortsDeskFitScore(
          { title: "Prince Harry celebrity news", summary: "gossip" },
          "morning"
        )
    );
  });
});

describe("한눈 균형 브리핑", () => {
  it("does not invent opposing perspective when only one side is sourced", () => {
    const briefing = buildBalanceBriefing({
      factualCore: ["연준이 금리를 동결했다"],
      verifiedFacts: ["연준이 금리를 동결했다"],
      claims: [{ text: "물가가 곧 잡힐 것이다", actor: "White House" }],
      perspectives: [
        {
          actor: "White House",
          position: "물가 안정 성과",
          supportingBasis: "공식 발표",
          role: "government",
          contentType: "official_statement",
          sourceArticleIds: ["art-1"],
        },
      ],
    });
    assert.equal(briefing.perspectives.length, 1);
    assert.equal(briefing.status, "needs_other_viewpoint");
    assert.equal(briefing.warning, MISSING_VIEWPOINT_LABEL);
    assert.equal(briefing.humanReviewRequired, true);
    assert.ok(briefing.missingPerspectives.length >= 1);
  });

  it("keeps source links on each perspective and separates fact vs claim", () => {
    const briefing = buildBalanceBriefing({
      verifiedFacts: ["금리를 동결했다"],
      claims: [
        {
          text: "성장이 즉시 회복된다",
          actor: "정부",
          conflictsWithOfficialRecord: true,
        },
      ],
      perspectives: [
        {
          actor: "정부",
          position: "성장 낙관",
          supportingBasis: "브리핑",
          role: "government",
          contentType: "official_statement",
          sourceArticleIds: ["a1"],
        },
        {
          actor: "야당",
          position: "가계 부담 우려",
          supportingBasis: "논평",
          role: "opposition",
          contentType: "advocacy",
          sourceArticleIds: ["a2"],
        },
      ],
      keyDisagreement: "성장 효과 vs 가계 부담",
    });
    assert.equal(briefing.status, "ok");
    assert.ok(briefing.perspectives.every((p) => p.sourceArticleIds.length > 0));
    assert.ok(briefing.verifiedFacts.includes("금리를 동결했다"));
    assert.ok(!briefing.verifiedFacts.includes("성장이 즉시 회복된다"));
    assert.ok(briefing.claims.some((c) => c.conflictsWithOfficialRecord));
  });

  it("rejects empty both-sides filler phrases", () => {
    assert.equal(
      containsAvoidedBalancePhrase("양쪽 모두 일리가 있습니다"),
      true
    );
  });
});

describe("inflow estimate", () => {
  it("treats PE bias simulation as planning only, not goal achieved", () => {
    const rows = [
      { sourceKey: "ap", category: "politics", count: 10 },
      { sourceKey: "ap", category: "other", count: 40 },
    ];
    const base = estimateEditorialInflow(rows);
    const biased = projectPeBiasedInflow(rows, 0.25);
    assert.ok(base.politicsEconomyShare < 0.55);
    assert.ok(biased.politicsEconomyShare < 0.55);
    assert.ok(base.gapToTarget > 0);
  });
});
