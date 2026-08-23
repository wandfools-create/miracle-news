/** Client-safe from-link constants (no Node-only deps). */

export const ARTICLE_BODY_MAX_CHARS = 24_000;
export const MIN_USABLE_BODY_CHARS = 400;
/** Admin 「기사 만들기」: enough extracted text to attempt generation (not meta-only). */
export const MIN_ADMIN_PROMOTE_BODY_CHARS = 120;
export const BODY_PREVIEW_LOG_CHARS = 500;
export const BODY_EXTRACTION_FAILED_METHOD = "body-extraction-failed";
