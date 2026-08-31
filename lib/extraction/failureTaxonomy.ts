export const EXTRACTION_FAILURE_CODES = [
  "rss-summary-only",
  "body-extraction-failed",
  "javascript-rendered",
  "login-required",
  "subscription-or-paywall",
  "robots-or-terms-restricted",
  "bot-protection",
  "http-403",
  "http-429",
  "http-5xx",
  "geo-restricted",
  "parser-mismatch",
  "video-without-transcript",
  "content-too-short",
  "content-not-article",
  "unknown",
] as const;

export type ExtractionFailureCode = (typeof EXTRACTION_FAILURE_CODES)[number];

export const EXTRACTION_FAILURE_LABELS: Record<ExtractionFailureCode, string> = {
  "rss-summary-only": "RSS 요약만 있음",
  "body-extraction-failed": "본문 추출 실패",
  "javascript-rendered": "JavaScript 렌더 필요",
  "login-required": "로그인 필요",
  "subscription-or-paywall": "구독·유료벽",
  "robots-or-terms-restricted": "robots/약관 제한",
  "bot-protection": "봇 차단",
  "http-403": "HTTP 403",
  "http-429": "HTTP 429",
  "http-5xx": "HTTP 5xx",
  "geo-restricted": "지역 제한",
  "parser-mismatch": "파서 불일치",
  "video-without-transcript": "영상·자막 없음",
  "content-too-short": "본문 너무 짧음",
  "content-not-article": "기사 본문 아님",
  unknown: "알 수 없음",
};

export function normalizeExtractionFailureCode(
  raw: string | null | undefined
): ExtractionFailureCode {
  const key = (raw || "").trim().toLowerCase() as ExtractionFailureCode;
  if ((EXTRACTION_FAILURE_CODES as readonly string[]).includes(key)) return key;
  if (key.includes("403")) return "http-403";
  if (key.includes("429")) return "http-429";
  if (key.includes("paywall") || key.includes("subscription")) {
    return "subscription-or-paywall";
  }
  if (key.includes("login")) return "login-required";
  if (key.includes("bot")) return "bot-protection";
  return "unknown";
}

export function mapEnrichCategoryToFailureCode(
  category: string | null | undefined
): ExtractionFailureCode {
  const c = (category || "").trim().toLowerCase();
  if (c.includes("paywall") || c.includes("subscription")) {
    return "subscription-or-paywall";
  }
  if (c.includes("short")) return "content-too-short";
  if (c.includes("rss")) return "rss-summary-only";
  return normalizeExtractionFailureCode(c);
}
