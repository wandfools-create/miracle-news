import { JSDOM } from "jsdom";

import {
  ARTICLE_BODY_MAX_CHARS,
  MIN_USABLE_BODY_CHARS,
} from "../../constants";
import { decodeHtmlEntities, stripHtmlToPlain } from "../../htmlText";
import { normalizeBody, splitBodyParagraphs } from "../bodyNormalize";
import type {
  BodyExtractMethodCategory,
  PublisherExtractResult,
  PublisherExtractStep,
  PublisherKey,
} from "./types";

export function countBodyParagraphs(text: string | null | undefined): number {
  if (!text?.trim()) return 0;
  return splitBodyParagraphs(normalizeBody(text))
    .map((p) => p.trim())
    .filter((p) => p.length >= 40).length;
}

export function hostKey(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function resolvePublisherKey(pageUrl: string): PublisherKey | null {
  const host = hostKey(pageUrl);
  if (host.includes("apnews.com")) return "ap";
  if (host.includes("foxnews.com")) return "fox";
  if (host.includes("pbs.org")) return "pbs";
  if (host.includes("csmonitor.com")) return "csm";
  return null;
}

export function parseHtmlDocument(html: string, pageUrl: string) {
  return new JSDOM(html, { url: pageUrl });
}

export function readOgDescription(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m?.[1]) {
      const text = decodeHtmlEntities(m[1].trim());
      if (text.length >= 80) return text;
    }
  }
  return null;
}

function elementPlainText(el: Element, maxLen = ARTICLE_BODY_MAX_CHARS): string {
  const clone = el.cloneNode(true) as Element;
  for (const tag of ["script", "style", "nav", "aside", "footer", "header"]) {
    clone.querySelectorAll(tag).forEach((node) => node.remove());
  }
  const paragraphs = [...clone.querySelectorAll("p")]
    .map((p) => p.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((t) => t.length >= 40);
  if (paragraphs.length >= 2) {
    return normalizeBody(paragraphs.join("\n\n"), maxLen);
  }
  // Keep newlines from block structure instead of collapsing to one line.
  const raw = clone.textContent?.replace(/\r\n/g, "\n") ?? "";
  return normalizeBody(raw, maxLen);
}

export function tryDomSelector(
  doc: Document,
  selector: string,
  minChars = MIN_USABLE_BODY_CHARS
): { body: string | null; length: number } {
  const el = doc.querySelector(selector);
  if (!el) return { body: null, length: 0 };
  const body = elementPlainText(el);
  return { body: body.length >= minChars ? body : null, length: body.length };
}

export function tryDomSelectors(
  doc: Document,
  selectors: string[],
  minChars = MIN_USABLE_BODY_CHARS
): { body: string | null; length: number; selector: string | null } {
  for (const selector of selectors) {
    const { body, length } = tryDomSelector(doc, selector, minChars);
    if (body) return { body, length, selector };
  }
  return { body: null, length: 0, selector: null };
}

export function tryHtmlPattern(
  html: string,
  pattern: RegExp,
  minChars = MIN_USABLE_BODY_CHARS
): { body: string | null; length: number } {
  const match = html.match(pattern);
  if (!match?.[1]) return { body: null, length: 0 };
  const body = normalizeBody(stripHtmlToPlain(match[1], ARTICLE_BODY_MAX_CHARS));
  return { body: body.length >= minChars ? body : null, length: body.length };
}

export function pushStep(
  steps: PublisherExtractStep[],
  step: string,
  length: number,
  minChars = MIN_USABLE_BODY_CHARS
): void {
  steps.push({
    step,
    ok: length >= minChars,
    length,
    detail: length >= minChars ? undefined : `need >= ${minChars} chars`,
  });
}

export function buildPublisherResult(input: {
  publisher: PublisherKey;
  body: string | null;
  method: string;
  methodCategory: BodyExtractMethodCategory;
  steps: PublisherExtractStep[];
}): PublisherExtractResult {
  const normalized = input.body ? normalizeBody(input.body) : null;
  const success = Boolean(
    normalized && normalized.length >= MIN_USABLE_BODY_CHARS
  );
  return {
    publisher: input.publisher,
    body: success ? normalized : null,
    method: success ? input.method : `${input.publisher}:failed`,
    methodCategory: input.methodCategory,
    steps: input.steps,
    success,
  };
}

export function pickLongestBody(
  candidates: Array<{ body: string | null; length: number }>
): { body: string | null; length: number } {
  let best: { body: string | null; length: number } = { body: null, length: 0 };
  for (const c of candidates) {
    if (c.body && c.length > best.length) {
      best = c;
    }
  }
  return best;
}
