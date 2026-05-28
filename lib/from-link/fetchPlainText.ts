import "server-only";

import { ARTICLE_BODY_MAX_CHARS } from "./constants";
import { fetchPageHtmlForExtraction } from "./fetchPageContent";
import { extractArticleBodyFromHtml } from "./server/extractArticleBody";

export type FetchedArticleBody = {
  text: string | null;
  method: string;
  pageFetchMethod: "http" | "playwright" | null;
};

export async function fetchArticleBodyFromUrl(
  pageUrl: string,
  maxLen = ARTICLE_BODY_MAX_CHARS
): Promise<FetchedArticleBody> {
  const doc = await fetchPageHtmlForExtraction(pageUrl);
  if (!doc.html) {
    console.warn("[from-link/extract] fetchArticleBodyFromUrl failed", {
      url: pageUrl,
      step: "fetch-page-content",
      error: doc.error,
    });
    return { text: null, method: "fetch-failed", pageFetchMethod: null };
  }

  const extracted = extractArticleBodyFromHtml(doc.html, doc.finalUrl);

  const text =
    extracted.success && extracted.body
      ? extracted.body.length > maxLen
        ? `${extracted.body.slice(0, maxLen - 1)}…`
        : extracted.body
      : null;

  return {
    text,
    method: extracted.method,
    pageFetchMethod: doc.pageFetchMethod,
  };
}

/** @deprecated Prefer fetchArticleBodyFromUrl — kept for callers that need any page text. */
export async function fetchPagePlainText(
  pageUrl: string,
  maxLen: number
): Promise<string | null> {
  const { text } = await fetchArticleBodyFromUrl(pageUrl, maxLen);
  return text;
}
