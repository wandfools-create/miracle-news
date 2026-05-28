import { isValidOriginalUrl } from "./resolveSubmittedUrl";
import { countSubstantiveParagraphs } from "./sanitizeArticleText";

export const INSUFFICIENT_MATERIAL_MESSAGE =
  "자료 부족: 제공된 원문만으로는 품질 기준을 충족하는 기사 본문을 만들 수 없습니다. 본문이 더 있는 링크를 사용하거나 원문을 보강한 뒤 다시 시도해 주세요.";

const MIN_BODY_CHARS = 900;
const MIN_BODY_PARAGRAPHS = 5;
const MIN_SUMMARY_CHARS = 30;
const MAX_SUMMARY_CHARS = 500;
const MAX_SUMMARY_BODY_SIMILARITY = 0.62;

export type FromLinkDraftQualityInput = {
  submittedOriginalUrl: string;
  titleKo: string;
  summaryKo: string;
  bodyKo: string;
};

export type FromLinkDraftQualityResult =
  | { ok: true }
  | { ok: false; reason: string };

export type FromLinkQualityCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export const FROM_LINK_MIN_BODY_KO_CHARS = MIN_BODY_CHARS;

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

export function evaluateFromLinkDraftQualityChecks(
  input: FromLinkDraftQualityInput
): FromLinkQualityCheckItem[] {
  const submitted = input.submittedOriginalUrl.trim();
  const titleKo = input.titleKo.trim();
  const summaryKo = input.summaryKo.trim();
  const bodyKo = input.bodyKo.trim();
  const paragraphs = countSubstantiveParagraphs(bodyKo);
  const sim = summaryBodySimilarity(summaryKo, bodyKo);

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
      detail: titleKo
        ? `${titleKo.length}자`
        : "제목이 비어 있습니다",
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
      label: `생성 본문 길이 (최소 ${MIN_BODY_CHARS}자)`,
      passed: bodyKo.length >= MIN_BODY_CHARS,
      detail: `${bodyKo.length}자`,
    },
    {
      id: "body_ko_paragraphs",
      label: `생성 본문 문단 수 (최소 ${MIN_BODY_PARAGRAPHS}개)`,
      passed: paragraphs >= MIN_BODY_PARAGRAPHS,
      detail: `${paragraphs}개`,
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
  "body_ko_paragraphs",
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

  const failed = checks.filter((c) => !c.passed);
  if (failed.length === 0) return false;

  return failed.every((c) => SHORT_SOURCE_SOFT_CHECK_IDS.has(c.id));
}

export function validateFromLinkDraftQuality(
  input: FromLinkDraftQualityInput
): FromLinkDraftQualityResult {
  const submitted = input.submittedOriginalUrl.trim();
  if (!isValidOriginalUrl(submitted)) {
    return {
      ok: false,
      reason: "원문 URL이 올바르지 않습니다. http(s) 링크를 다시 확인해 주세요.",
    };
  }

  const checks = evaluateFromLinkDraftQualityChecks(input);
  const firstFail = checks.find((c) => !c.passed);
  if (!firstFail) return { ok: true };

  if (firstFail.id === "original_url") {
    return {
      ok: false,
      reason: "원문 URL이 올바르지 않습니다. http(s) 링크를 다시 확인해 주세요.",
    };
  }
  if (firstFail.id === "title_ko") {
    return { ok: false, reason: "제목이 없어 저장할 수 없습니다." };
  }
  if (firstFail.id === "summary_ko_max") {
    return {
      ok: false,
      reason:
        "핵심 요약이 너무 깁니다. 요약과 본문이 구분되도록 다시 분석해 주세요.",
    };
  }
  if (
    firstFail.id === "summary_ko_length" ||
    firstFail.id === "body_ko_length" ||
    firstFail.id === "body_ko_paragraphs"
  ) {
    const paragraphs = countSubstantiveParagraphs(input.bodyKo.trim());
    if (firstFail.id === "body_ko_paragraphs") {
      return {
        ok: false,
        reason: `${INSUFFICIENT_MATERIAL_MESSAGE} (본문 문단 수: ${paragraphs}/${MIN_BODY_PARAGRAPHS})`,
      };
    }
    return { ok: false, reason: INSUFFICIENT_MATERIAL_MESSAGE };
  }
  if (firstFail.id === "summary_body_similarity") {
    return {
      ok: false,
      reason:
        "본문이 핵심 요약과 거의 같습니다. 더 긴 본문이 생성되도록 링크를 다시 분석하거나 자료가 충분한 URL을 사용해 주세요.",
    };
  }

  return { ok: false, reason: INSUFFICIENT_MATERIAL_MESSAGE };
}
