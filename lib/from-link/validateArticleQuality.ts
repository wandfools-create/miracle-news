import { isValidOriginalUrl } from "./resolveSubmittedUrl";
import { countSubstantiveParagraphs } from "./sanitizeArticleText";

export const INSUFFICIENT_MATERIAL_MESSAGE =
  "자료 부족: 제공된 원문만으로는 품질 기준을 충족하는 기사 본문을 만들 수 없습니다. 본문이 더 있는 링크를 사용하거나 원문을 보강한 뒤 다시 시도해 주세요.";

/** Recommended Korean body length — never a hard fail by itself. */
export const TARGET_BODY_CHARS_MIN = 900;
export const TARGET_BODY_CHARS_MAX = 1200;

/** Only length below this can fail on character count alone. */
export const MIN_BODY_CHARS = 500;
/** Below this paragraph count: warning, not a hard fail. */
export const WARN_BODY_PARAGRAPHS = 3;

const MIN_SUMMARY_CHARS = 30;
const MAX_SUMMARY_CHARS = 500;
const MAX_SUMMARY_BODY_SIMILARITY = 0.62;

export const SHORT_ARTICLE_REVIEW_NOTE = "짧은 기사 · 최종 검토 권장";

/** @deprecated Use MIN_BODY_CHARS. Kept so callers do not reintroduce a 900-char gate. */
export const FROM_LINK_MIN_BODY_KO_CHARS = MIN_BODY_CHARS;
/** @deprecated Not a hard gate. Warning threshold only. */
export const FROM_LINK_MIN_BODY_KO_PARAGRAPHS = WARN_BODY_PARAGRAPHS;

export type FromLinkDraftQualityInput = {
  submittedOriginalUrl: string;
  titleKo: string;
  summaryKo: string;
  bodyKo: string;
};

export type FromLinkDraftQualityResult =
  | { ok: true; shortArticleReview: boolean; warnings: string[] }
  | { ok: false; reason: string; failedCheckIds?: string[] };

export type FromLinkQualityCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity?: "fail" | "warn";
};

export type BodyContentFlags = {
  promotional: boolean;
  repetitive: boolean;
  boilerplate: boolean;
  thinFacts: boolean;
};

/** 500–899자: pass quality, but recommend final human review. */
export function isShortArticleRecommendedReview(bodyKo: string): boolean {
  const len = bodyKo.trim().length;
  return len >= MIN_BODY_CHARS && len < TARGET_BODY_CHARS_MIN;
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

/** Jaccard similarity on word tokens (0–1). */
export function summaryBodySimilarity(summary: string, body: string): number {
  const tokenize = (s: string) =>
    new Set(
      normalizeForCompare(s)
        .split(" ")
        .filter((w) => w.length > 2)
    );

  const a = tokenize(summary);
  const b = tokenize(body);
  if (a.size === 0 || b.size === 0) return 0;

  let inter = 0;
  for (const w of a) {
    if (b.has(w)) inter += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

const PROMO_PATTERNS: RegExp[] = [
  /지금\s*구매/,
  /특가/,
  /할인\s*코드/,
  /쿠폰\s*코드/,
  /무료\s*체험/,
  /한정\s*수량/,
  /최저가/,
  /클릭하세요/,
  /구매하세요/,
  /프로모션/,
  /스폰서(드)?\s*(콘텐츠|기사|광고)/,
  /광고성/,
  /buy now/i,
  /limited[- ]time offer/i,
  /promo code/i,
  /sponsored content/i,
  /shop now/i,
  /subscribe now/i,
  /구독하고\s*혜택/,
];

const BOILERPLATE_PATTERNS: RegExp[] = [
  /쿠키를?\s*허용/,
  /개인정보\s*처리방침/,
  /이용약관/,
  /related stories/i,
  /most read/i,
  /accept (all )?cookies/i,
  /privacy policy/i,
  /관련\s*기사/,
  /많이\s*본\s*(뉴스|기사)/,
  /뉴스레터\s*구독/,
  /로그인\s*[·,]?\s*회원가입/,
  /share this article/i,
  /recommended for you/i,
  /이\s*사이트는\s*쿠키/,
  /광고\s*문의/,
];

function sentenceMatchRatio(sentences: string[], patterns: RegExp[]): number {
  if (sentences.length === 0) return 0;
  let hits = 0;
  for (const s of sentences) {
    if (patterns.some((p) => p.test(s))) hits += 1;
  }
  return hits / sentences.length;
}

function distinctPatternHits(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    if (p.test(text)) n += 1;
  }
  return n;
}

function maxSentenceRepeatRatio(sentences: string[]): {
  ratio: number;
  maxCount: number;
} {
  if (sentences.length === 0) return { ratio: 0, maxCount: 0 };
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const key = normalizeForCompare(s);
    if (key.length < 10) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let maxCount = 0;
  for (const c of counts.values()) maxCount = Math.max(maxCount, c);
  return { ratio: maxCount / sentences.length, maxCount };
}

function uniqueHangulDiversity(text: string): { chars: number; unique: number } {
  const hangul = text.match(/[가-힣]/g) ?? [];
  return { chars: hangul.length, unique: new Set(hangul).size };
}

export function assessBodyContentFlags(bodyKo: string): BodyContentFlags {
  const body = bodyKo.trim();
  const sentences = splitSentences(body);
  const promoRatio = sentenceMatchRatio(sentences, PROMO_PATTERNS);
  const promoHits = distinctPatternHits(body, PROMO_PATTERNS);
  const boilerRatio = sentenceMatchRatio(sentences, BOILERPLATE_PATTERNS);
  const boilerHits = distinctPatternHits(body, BOILERPLATE_PATTERNS);
  const repeats = maxSentenceRepeatRatio(sentences);
  const diversity = uniqueHangulDiversity(body);

  const promotional = promoHits >= 3 || (sentences.length >= 3 && promoRatio >= 0.4);
  const boilerplate =
    boilerHits >= 3 || (sentences.length >= 3 && boilerRatio >= 0.4);
  const repetitive =
    repeats.maxCount >= 3 || (sentences.length >= 4 && repeats.ratio >= 0.4);
  const thinFacts =
    diversity.chars >= 200 && diversity.unique < 28 && !promotional;

  return { promotional, repetitive, boilerplate, thinFacts };
}

export function evaluateFromLinkDraftQualityChecks(
  input: FromLinkDraftQualityInput
): FromLinkQualityCheckItem[] {
  const submitted = input.submittedOriginalUrl.trim();
  const titleKo = input.titleKo.trim();
  const summaryKo = input.summaryKo.trim();
  const bodyKo = input.bodyKo.trim();
  const paragraphs = countSubstantiveParagraphs(bodyKo);
  const sim = summaryBodySimilarity(summaryKo, bodyKo);
  const flags = assessBodyContentFlags(bodyKo);
  const shortReview = isShortArticleRecommendedReview(bodyKo);

  return [
    {
      id: "original_url",
      label: "원문 URL",
      passed: isValidOriginalUrl(submitted),
      detail: isValidOriginalUrl(submitted)
        ? "유효한 http(s) URL"
        : "URL 형식이 올바르지 않습니다",
    },
    {
      id: "title_ko",
      label: "한글 제목",
      passed: Boolean(titleKo),
      detail: titleKo ? `${titleKo.length}자` : "제목이 비어 있습니다",
    },
    {
      id: "summary_ko_length",
      label: `핵심 요약 길이 (최소 ${MIN_SUMMARY_CHARS}자)`,
      passed: summaryKo.length >= MIN_SUMMARY_CHARS,
      detail: `${summaryKo.length}자`,
    },
    {
      id: "summary_ko_max",
      label: `핵심 요약 상한 (최대 ${MAX_SUMMARY_CHARS}자)`,
      passed: summaryKo.length <= MAX_SUMMARY_CHARS,
      detail: `${summaryKo.length}자`,
    },
    {
      id: "body_ko_length",
      label: `생성 본문 길이 (최소 ${MIN_BODY_CHARS}자, 권장 목표 ${TARGET_BODY_CHARS_MIN}–${TARGET_BODY_CHARS_MAX}자)`,
      passed: bodyKo.length >= MIN_BODY_CHARS,
      detail: shortReview
        ? `${bodyKo.length}자 / 최소 ${MIN_BODY_CHARS}자 통과 · 권장 목표 ${TARGET_BODY_CHARS_MIN}자 미만`
        : `${bodyKo.length}자 / 최소 ${MIN_BODY_CHARS}자`,
    },
    {
      id: "body_ko_paragraphs",
      label: `생성 본문 문단 수 (${WARN_BODY_PARAGRAPHS}문단 미만이면 경고, 실패 아님)`,
      passed: paragraphs >= WARN_BODY_PARAGRAPHS,
      severity: "warn",
      detail: `${paragraphs}개 / 경고 기준 ${WARN_BODY_PARAGRAPHS}개`,
    },
    {
      id: "body_promotional",
      label: "광고·홍보성 문구 과다",
      passed: !flags.promotional,
      detail: flags.promotional
        ? "광고·홍보성 문구가 본문의 상당 부분을 차지합니다"
        : "해당 없음",
    },
    {
      id: "body_repetition",
      label: "반복 문장",
      passed: !flags.repetitive,
      detail: flags.repetitive
        ? "동일·유사 문장 반복이 심합니다"
        : "해당 없음",
    },
    {
      id: "body_boilerplate",
      label: "기사와 무관한 페이지 텍스트",
      passed: !flags.boilerplate,
      detail: flags.boilerplate
        ? "쿠키·관련기사·구독 안내 등 페이지 잔여 텍스트가 대부분입니다"
        : "해당 없음",
    },
    {
      id: "body_thin_facts",
      label: "핵심 사실 밀도",
      passed: !flags.thinFacts,
      detail: flags.thinFacts
        ? "본문이 지나치게 짧거나 핵심 사실이 거의 없습니다"
        : "해당 없음",
    },
    {
      id: "summary_body_similarity",
      label: `요약·본문 유사도 (최대 ${MAX_SUMMARY_BODY_SIMILARITY})`,
      passed: sim <= MAX_SUMMARY_BODY_SIMILARITY,
      detail: `유사도 ${sim.toFixed(2)}`,
    },
  ];
}

const SHORT_SOURCE_SOFT_CHECK_IDS = new Set([
  "body_ko_length",
  "body_promotional",
  "body_repetition",
  "body_boilerplate",
  "body_thin_facts",
  "summary_body_similarity",
]);

export function canAllowShortSourceDraftOverride(
  checks: FromLinkQualityCheckItem[],
  sourceBodyChars: number,
  supplementalChars: number,
  minSourceChars = 400
): boolean {
  const sourceOk =
    sourceBodyChars >= minSourceChars || supplementalChars >= minSourceChars;
  if (!sourceOk) return false;

  const failed = checks.filter(
    (c) => !c.passed && (c.severity ?? "fail") === "fail"
  );
  if (failed.length === 0) return false;

  return failed.every((c) => SHORT_SOURCE_SOFT_CHECK_IDS.has(c.id));
}

function reasonForFailedCheck(
  check: FromLinkQualityCheckItem,
  bodyKo: string
): string {
  const bodyLen = bodyKo.trim().length;

  switch (check.id) {
    case "original_url":
      return "품질 실패: 원문 URL 형식 오류";
    case "title_ko":
      return "품질 실패: 한글 제목 없음";
    case "summary_ko_length":
      return `품질 실패: 핵심 요약 ${MIN_SUMMARY_CHARS}자 미달 (현재 ${check.detail})`;
    case "summary_ko_max":
      return `품질 실패: 핵심 요약 ${MAX_SUMMARY_CHARS}자 초과 (현재 ${check.detail})`;
    case "body_ko_length":
      return `품질 실패: 생성 본문 ${MIN_BODY_CHARS}자 미달 (현재 ${bodyLen}자)`;
    case "body_promotional":
      return "품질 실패: 광고·홍보성 문구가 본문의 대부분입니다";
    case "body_repetition":
      return "품질 실패: 반복 문장이 심해 기사로 보기 어렵습니다";
    case "body_boilerplate":
      return "품질 실패: 기사와 무관한 페이지 텍스트가 대부분입니다";
    case "body_thin_facts":
      return "품질 실패: 본문이 지나치게 짧거나 핵심 사실이 거의 없습니다";
    case "summary_body_similarity":
      return `품질 실패: 요약·본문 유사도 과다 (${check.detail})`;
    default:
      return `품질 실패: ${check.id} (${check.detail})`;
  }
}

export function validateFromLinkDraftQuality(
  input: FromLinkDraftQualityInput
): FromLinkDraftQualityResult {
  const submitted = input.submittedOriginalUrl.trim();
  const bodyKo = input.bodyKo.trim();
  const checks = evaluateFromLinkDraftQualityChecks(input);
  const failed = checks.filter(
    (c) => !c.passed && (c.severity ?? "fail") === "fail"
  );
  const warnChecks = checks.filter(
    (c) => !c.passed && c.severity === "warn"
  );
  const bodyLen = bodyKo.length;
  const paragraphs = countSubstantiveParagraphs(bodyKo);
  const shortArticleReview = isShortArticleRecommendedReview(bodyKo);

  console.info("[from-link/quality] validator checks", {
    url: submitted,
    generatedBodyKoLength: bodyLen,
    generatedBodyKoParagraphs: paragraphs,
    minBodyChars: MIN_BODY_CHARS,
    targetBodyChars: `${TARGET_BODY_CHARS_MIN}-${TARGET_BODY_CHARS_MAX}`,
    warnBodyParagraphs: WARN_BODY_PARAGRAPHS,
    under500Chars: bodyLen < MIN_BODY_CHARS,
    under3Paragraphs: paragraphs < WARN_BODY_PARAGRAPHS,
    shortArticleReviewRecommended: shortArticleReview,
    nineHundredIsTargetOnly: true,
    checks: checks.map((c) => ({
      id: c.id,
      passed: c.passed,
      severity: c.severity ?? "fail",
      detail: c.detail,
    })),
    failedIds: failed.map((c) => c.id),
  });

  if (failed.length === 0) {
    const warnings = [
      ...warnChecks.map((c) => `${c.label}: ${c.detail}`),
      shortArticleReview ? SHORT_ARTICLE_REVIEW_NOTE : null,
    ].filter((w): w is string => Boolean(w));

    console.info("[from-link/quality] validator passed", {
      url: submitted,
      shortArticleReviewRecommended: shortArticleReview,
      warnings,
    });
    return { ok: true, shortArticleReview, warnings };
  }

  const firstFail = failed[0]!;
  const reason = reasonForFailedCheck(firstFail, bodyKo);
  const allReasons = failed.map((c) => reasonForFailedCheck(c, bodyKo));

  console.warn("[from-link/quality] validator FAILED", {
    url: submitted,
    firstFailId: firstFail.id,
    firstFailReason: reason,
    allFailedReasons: allReasons,
    under500Chars: bodyLen < MIN_BODY_CHARS,
    generatedBodyKoLength: bodyLen,
    generatedBodyKoParagraphs: paragraphs,
    titleKoLength: input.titleKo.trim().length,
    summaryKoLength: input.summaryKo.trim().length,
  });

  return {
    ok: false,
    reason: allReasons.join(" · "),
    failedCheckIds: failed.map((c) => c.id),
  };
}
