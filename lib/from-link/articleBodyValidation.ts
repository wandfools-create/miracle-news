import {
  BODY_EXTRACTION_FAILED_METHOD,
  MIN_USABLE_BODY_CHARS,
} from "./constants";

export function isSuccessfulBodyExtraction(extracted: {
  articleBodyPlain?: string | null;
  articleBodyExtractSuccess?: boolean;
  articleBodyExtractMethod?: string | null;
}): boolean {
  if (extracted.articleBodyExtractSuccess === false) return false;
  if (extracted.articleBodyExtractMethod === BODY_EXTRACTION_FAILED_METHOD) {
    return false;
  }
  if (extracted.articleBodyExtractMethod === "meta-description-fallback") {
    return false;
  }
  return (extracted.articleBodyPlain?.trim().length ?? 0) >= MIN_USABLE_BODY_CHARS;
}
