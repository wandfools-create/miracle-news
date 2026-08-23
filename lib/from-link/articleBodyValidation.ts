import {
  BODY_EXTRACTION_FAILED_METHOD,
  MIN_ADMIN_PROMOTE_BODY_CHARS,
  MIN_USABLE_BODY_CHARS,
} from "./constants";

function isRejectedExtractMethod(method: string | null | undefined): boolean {
  return (
    method === BODY_EXTRACTION_FAILED_METHOD ||
    method === "meta-description-fallback"
  );
}

export function isSuccessfulBodyExtraction(extracted: {
  articleBodyPlain?: string | null;
  articleBodyExtractSuccess?: boolean;
  articleBodyExtractMethod?: string | null;
}): boolean {
  if (extracted.articleBodyExtractSuccess === false) return false;
  if (isRejectedExtractMethod(extracted.articleBodyExtractMethod)) {
    return false;
  }
  return (extracted.articleBodyPlain?.trim().length ?? 0) >= MIN_USABLE_BODY_CHARS;
}

/**
 * Admin promote: allow shorter extracted bodies when extraction itself succeeded
 * (not meta-description / failed). Still blocks near-impossible extraction.
 */
export function isAdminUsableBodyExtraction(extracted: {
  articleBodyPlain?: string | null;
  articleBodyExtractSuccess?: boolean;
  articleBodyExtractMethod?: string | null;
}): boolean {
  if (extracted.articleBodyExtractSuccess === false) return false;
  if (isRejectedExtractMethod(extracted.articleBodyExtractMethod)) {
    return false;
  }
  return (
    (extracted.articleBodyPlain?.trim().length ?? 0) >=
    MIN_ADMIN_PROMOTE_BODY_CHARS
  );
}
