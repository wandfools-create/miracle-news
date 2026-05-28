import "server-only";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { ARTICLE_BODY_MAX_CHARS } from "../constants";
import { stripHtmlToPlain } from "../htmlText";

export function extractWithReadability(
  html: string,
  pageUrl: string
): string | null {
  try {
    const dom = new JSDOM(html, { url: pageUrl });
    const reader = new Readability(dom.window.document, {
      charThreshold: 80,
    });
    const parsed = reader.parse();
    if (!parsed) return null;

    const fromText = parsed.textContent?.trim();
    if (fromText && fromText.length >= 200) {
      return fromText.length > ARTICLE_BODY_MAX_CHARS
        ? `${fromText.slice(0, ARTICLE_BODY_MAX_CHARS - 1)}…`
        : fromText;
    }

    if (parsed.content) {
      const fromHtml = stripHtmlToPlain(parsed.content, ARTICLE_BODY_MAX_CHARS);
      if (fromHtml.length >= 200) return fromHtml;
    }

    return null;
  } catch (err) {
    console.warn("[from-link/extract] Readability threw", {
      url: pageUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
