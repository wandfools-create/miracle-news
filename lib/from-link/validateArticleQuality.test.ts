import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  MIN_BODY_CHARS,
  SHORT_ARTICLE_REVIEW_NOTE,
  THIN_SOURCE_MATERIAL_NOTE,
  TARGET_BODY_CHARS_MIN,
  canAllowAdminShortArticleSave,
  isShortArticleRecommendedReview,
  validateFromLinkDraftQuality,
} from "./validateArticleQuality";

console.info = () => {};
console.warn = () => {};

const SAMPLE_URL = "https://apnews.com/article/quality-fixture-test";

const NEWS_BASE = [
  "미국 법무부는 대형 기술 기업을 상대로 한 반독점 소송에서 핵심 증거를 추가로 제출했다고 밝혔다.",
  "검찰은 해당 기업이 검색 시장에서 경쟁을 제한하고 광고 단가를 왜곡했다고 주장했다. 회사 측은 이용자 선택과 제품 혁신을 근거로 혐의를 전면 부인했다.",
  "재판부는 오는 가을 증인 신문 일정을 확정하고, 양측에 자료 제출 시한을 다시 고지했다. 업계에서는 판결이 디지털 광고 시장 전반에 영향을 줄 수 있다고 보고 있다.",
  "백악관 관계자는 이번 사건이 소비자 보호와 직결된다고 말했고, 유럽 규제 당국도 유사 쟁점을 검토 중이라고 전했다.",
].join("\n\n");

const EXTRA_SENTENCES = [
  "원고 측 변호인은 내부 이메일이 의도적 봉쇄를 보여준다고 강조했다.",
  "피고 기업은 스타트업 인수와 기본 검색 설정이 합법적인 사업 판단이라고 반박했다.",
  "경제학자들은 시장 점유율만으로 위법성을 단정하기 어렵다고 지적했다.",
  "일부 광고주는 수수료 부담이 커져 중소 매체가 타격을 받았다고 증언했다.",
  "주 검찰총장 연합도 별도 의견서를 통해 소비자 피해를 주장했다.",
  "증권가에서는 소송 장기화가 주가 변동성을 키울 것으로 전망했다.",
  "시민단체는 개인정보와 검색 중립성 문제도 함께 다뤄져야 한다고 요구했다.",
  "법원 밖에서는 취재진이 양측 대변인 브리핑을 기다리며 대기했다.",
];

function fitToLength(target: number): string {
  let body = NEWS_BASE;
  let i = 0;
  while (body.length < target + 8) {
    body += `\n\n${EXTRA_SENTENCES[i % EXTRA_SENTENCES.length]} 추가 맥락 ${i + 1}항.`;
    i += 1;
  }
  let out = body.slice(0, target);
  if (/\s$/.test(out)) {
    out = `${out.slice(0, -1)}다`;
  }
  while (out.length < target) out += "다";
  return out.slice(0, target);
}

function qualityInput(bodyKo: string, title = "반독점 소송 쟁점 확대") {
  return {
    submittedOriginalUrl: SAMPLE_URL,
    titleKo: title,
    summaryKo:
      "미국 법무부가 대형 기술 기업 반독점 소송에서 추가 증거를 제출하며 공방을 이어가고 있다.",
    bodyKo,
  };
}

describe("from-link article quality gates (fixture only, no OpenAI)", () => {
  it("exports 500 as the only length hard gate and 900 as a target", () => {
    assert.equal(MIN_BODY_CHARS, 500);
    assert.equal(TARGET_BODY_CHARS_MIN, 900);
  });

  it("786-character normal article → PASS + short-article warning", () => {
    const bodyKo = fitToLength(786);
    assert.equal(bodyKo.length, 786);
    const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.shortArticleReview, true);
    assert.ok(result.warnings.includes(SHORT_ARTICLE_REVIEW_NOTE));
    assert.equal(isShortArticleRecommendedReview(bodyKo), true);
  });

  it("833-character normal article → PASS + short-article warning", () => {
    const bodyKo = fitToLength(833);
    assert.equal(bodyKo.length, 833);
    const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.shortArticleReview, true);
    assert.ok(result.warnings.includes(SHORT_ARTICLE_REVIEW_NOTE));
  });

  it("950-character normal article → PASS without short-article warning", () => {
    const bodyKo = fitToLength(950);
    assert.equal(bodyKo.length, 950);
    const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.shortArticleReview, false);
    assert.equal(result.warnings.includes(SHORT_ARTICLE_REVIEW_NOTE), false);
  });

  it("400-character thin article → FAIL", () => {
    const bodyKo = fitToLength(400);
    assert.equal(bodyKo.length, 400);
    const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.failedCheckIds?.includes("body_ko_length"));
    assert.match(result.reason, /500자 미달/);
    assert.doesNotMatch(result.reason, /900자/);
  });

  it("admin soft-save allows 300–400 char normal articles (length only)", () => {
    for (const n of [300, 400]) {
      const bodyKo = fitToLength(n);
      const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
      assert.equal(result.ok, false);
      if (result.ok) continue;
      assert.equal(
        canAllowAdminShortArticleSave(result, bodyKo),
        true,
        `${n}자 should soft-save for admin`
      );
      assert.equal(isShortArticleRecommendedReview(bodyKo), true);
    }
  });

  it("admin soft-save rejects empty / promotional even when short", () => {
    const empty = validateFromLinkDraftQuality(qualityInput(""));
    assert.equal(empty.ok, false);
    if (!empty.ok) {
      assert.equal(canAllowAdminShortArticleSave(empty, ""), false);
    }

    const chunk = [
      "지금 특가로 구매하세요. 쿠폰 코드 NEWS20을 입력하면 추가 할인을 받을 수 있습니다.",
      "한정 수량 최저가 이벤트가 진행 중입니다. 무료 체험 후 구독하고 혜택을 받으세요.",
      "클릭하세요. 지금 구매하시면 사은품이 지급됩니다. Shop now for a limited-time offer.",
    ].join(" ");
    const promo = Array.from({ length: 2 }, () => chunk).join("\n\n");
    const promoResult = validateFromLinkDraftQuality(qualityInput(promo));
    assert.equal(promoResult.ok, false);
    if (!promoResult.ok) {
      assert.equal(canAllowAdminShortArticleSave(promoResult, promo), false);
    }
  });

  it("short-article note strings match admin review badge copy", () => {
    assert.ok(SHORT_ARTICLE_REVIEW_NOTE.includes("짧은 기사"));
    assert.match(SHORT_ARTICLE_REVIEW_NOTE, /최종 검토 필요/);
    assert.equal(THIN_SOURCE_MATERIAL_NOTE, "원문 정보량 적음");
  });

  it("promotional article → FAIL even when longer than 500 chars", () => {
    const chunk = [
      "지금 특가로 구매하세요. 쿠폰 코드 NEWS20을 입력하면 추가 할인을 받을 수 있습니다.",
      "한정 수량 최저가 이벤트가 진행 중입니다. 무료 체험 후 구독하고 혜택을 받으세요.",
      "클릭하세요. 지금 구매하시면 사은품이 지급됩니다. Shop now for a limited-time offer.",
      "프로모션 기간에만 제공되는 스폰서 콘텐츠입니다. 할인 코드로 장바구니를 채우세요.",
      "최저가 보장과 무료 체험을 놓치지 마세요. 구매하세요, 지금 구매하세요.",
    ].join(" ");
    const bodyKo = Array.from({ length: 4 }, () => chunk).join("\n\n");
    assert.ok(bodyKo.length >= 500);
    const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.failedCheckIds?.includes("body_promotional"));
    assert.doesNotMatch(result.reason, /900자/);
  });

  it("repetitive article → FAIL even when longer than 500 chars", () => {
    const line =
      "법원은 피고인에게 징역 3년을 선고했다고 밝혔다. 이는 반복 테스트 문장입니다.";
    const bodyKo = Array.from({ length: 20 }, () => line).join("\n\n");
    assert.ok(bodyKo.length >= 500);
    const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.failedCheckIds?.includes("body_repetition"));
    assert.doesNotMatch(result.reason, /900자/);
  });

  it("does not fail a 786-char article solely for having fewer than 5 paragraphs", () => {
    const p1 =
      "검찰은 기술 기업의 검색 기본 설정 계약이 경쟁을 제한했다고 주장하며 내부 문건을 공개했다. 회사는 이용자 편의를 위한 선택이었다고 반박했고 스타트업 인수도 통상적 사업 판단이라고 설명했다. 경제학자들은 시장 점유율만으로 위법성을 단정하기 어렵다고 지적했으며 광고 수수료와 소비자 후생을 함께 봐야 한다고 했다.";
    let p2 =
      "재판부는 자료 제출 시한을 연장했고 증인 신문은 가을로 미뤄졌다. 주 검찰총장 연합은 소비자 피해를 주장하는 의견서를 냈고 증권가는 소송 장기화가 주가 변동성을 키울 것으로 전망했다. 유럽 규제 당국은 유사 쟁점의 국제 공조를 검토하고 있으며 백악관 관계자는 소비자 보호와 직결된 사안이라고 말했다. 시민단체는 검색 중립성과 개인정보 쟁점을 함께 다루자고 요구했다. 법원 밖 취재진은 양측 대변인 브리핑을 기다리며 대기했고 향후 판결이 디지털 광고 시장 전반에 영향을 줄 수 있다는 관측이 나왔다. 지방 검찰도 별도 수사 기록을 공유할 수 있다고 전했으며 애널리스트들은 실적보다 규제 리스크를 주목했다.";
    let bodyKo = `${p1}\n\n${p2}`;
    let n = 1;
    while (bodyKo.length < 786) {
      bodyKo += ` 보충 맥락 ${n}은 이용자 선택권과 기본 앱 설정, 광고 입찰 구조를 각각 다르게 설명한다.`;
      n += 1;
    }
    bodyKo = bodyKo.slice(0, 786);
    if (/\s$/.test(bodyKo)) bodyKo = `${bodyKo.slice(0, -1)}다`;
    assert.equal(bodyKo.length, 786);
    const result = validateFromLinkDraftQuality(qualityInput(bodyKo));
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : `unexpected fail: ${result.reason}`
    );
    if (!result.ok) return;
    assert.equal(result.shortArticleReview, true);
  });
});

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".git" ||
      name.endsWith(".test.ts")
    ) {
      continue;
    }
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectSourceFiles(full, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("no remaining 900-char hard-fail paths", () => {
  it("validator never emits 900자 미달", () => {
    const result = validateFromLinkDraftQuality(qualityInput(fitToLength(786)));
    assert.equal(result.ok, true);
    const fail = validateFromLinkDraftQuality(qualityInput(fitToLength(400)));
    assert.equal(fail.ok, false);
    if (!fail.ok) {
      assert.doesNotMatch(fail.reason, /900자 미달/);
      assert.match(fail.reason, /500자 미달/);
    }
  });

  it("repository source has no generated-body 900-char fail gate", () => {
    const root = join(import.meta.dirname, "..", "..");
    const files = collectSourceFiles(root);
    const banned = [
      /생성 본문 900자 미달/,
      /MIN_BODY_CHARS\s*=\s*900/,
      /minGeneratedBodyKoChars:\s*900/,
      /from_link_summarize_length_expand/,
      /needsLengthExpand/,
      /KOREAN_EDITOR_LENGTH_EXPAND_PROMPT/,
      /countSubstantiveParagraphs\([^)]+\)\s*<\s*5/,
    ];
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const re of banned) {
        if (re.test(text)) hits.push(`${file}: ${re}`);
      }
    }
    assert.deepEqual(hits, []);
  });
});
