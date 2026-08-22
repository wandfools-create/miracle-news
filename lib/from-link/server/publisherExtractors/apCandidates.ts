import "server-only";

import { ARTICLE_BODY_MAX_CHARS, MIN_USABLE_BODY_CHARS } from "../../constants";
import type { JsonLdArticleFields } from "../articleBodyTypes";
import { normalizeBody, splitBodyParagraphs } from "../bodyNormalize";
import { extractWithReadability } from "../extractReadability";
import type { BodyExtractMethodCategory } from "./types";
import { parseHtmlDocument } from "./shared";

export type ApBodyCandidate = {
  method: string;
  body: string | null;
  bodyLength: number;
  paragraphCount: number;
  methodCategory: BodyExtractMethodCategory;
};

const RICH_TEXT_ROOT =
  "div.RichTextStoryBody, div[class*='RichTextStoryBody']";

/** Remove chrome before querying — do not remove Page-storyBody itself. */
const CHROME_SELECTOR = [
  "script",
  "style",
  "nav",
  "aside",
  "footer",
  "header",
  "[role='navigation']",
  ".Carousel",
  ".Author-bio",
  ".PageList",
  ".PageListStandardB",
  ".Comments",
  ".CommentCount",
  ".VideoPlayer",
  ".EmbeddedVideo",
  ".SocialShare",
  ".Page-actions",
  ".fs-feed-ad",
  "[class*='Newsletter']",
  "[class*='Related']",
  "[class*='Promo']",
  "[class*='Advert']",
  "[data-key='related']",
].join(", ");

/** Elements whose descendants are not story prose. */
const STORY_EXCLUDE_CLOSEST = CHROME_SELECTOR;

function cleanText(node: Element): string {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

function paragraphsFromNodes(nodes: Element[], minLen = 25): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const text = cleanText(node);
    if (text.length < minLen) continue;
    out.push(text);
  }
  return out;
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Full AP story: Page-storyBody from lead through later h2 sections.
 * Includes every RichTextStoryBody + following h2/h3 + p, skips ads/related/chrome.
 */
export function extractApFullStoryBlocks(doc: Document): string[] {
  const root =
    doc.querySelector(".Page-storyBody") ||
    doc.querySelector("div[class*='Page-storyBody']") ||
    doc.querySelector("article") ||
    doc.querySelector("main");
  if (!root) return [];

  const blocks: string[] = [];
  for (const el of root.querySelectorAll("h2, h3, p")) {
    if (el.closest(STORY_EXCLUDE_CLOSEST)) continue;
    const tag = el.tagName.toLowerCase();
    const text = cleanText(el);
    const minLen = tag === "h2" || tag === "h3" ? 12 : 25;
    if (text.length < minLen) continue;
    // Drop short photo credit-only captions
    if (
      tag === "p" &&
      text.length < 120 &&
      /\(AP Photo\//i.test(text)
    ) {
      continue;
    }
    blocks.push(text);
  }

  return dedupePreserveOrder(blocks);
}

function candidateFromParagraphs(
  method: string,
  paragraphs: string[],
  methodCategory: BodyExtractMethodCategory
): ApBodyCandidate {
  const unique = dedupePreserveOrder(paragraphs);
  if (unique.length === 0) {
    return {
      method,
      body: null,
      bodyLength: 0,
      paragraphCount: 0,
      methodCategory,
    };
  }
  const body = normalizeBody(unique.join("\n\n"), ARTICLE_BODY_MAX_CHARS);
  const paragraphCount = splitBodyParagraphs(body).filter(
    (p) => p.length >= 40
  ).length;
  const usable = body.length >= MIN_USABLE_BODY_CHARS ? body : null;
  return {
    method,
    body: usable,
    bodyLength: body.length,
    paragraphCount,
    methodCategory,
  };
}

function candidateFromRawText(
  method: string,
  raw: string | null | undefined,
  methodCategory: BodyExtractMethodCategory
): ApBodyCandidate {
  if (!raw?.trim()) {
    return {
      method,
      body: null,
      bodyLength: 0,
      paragraphCount: 0,
      methodCategory,
    };
  }
  const body = normalizeBody(raw, ARTICLE_BODY_MAX_CHARS);
  const paragraphCount = splitBodyParagraphs(body).filter(
    (p) => p.length >= 40
  ).length;
  const usable = body.length >= MIN_USABLE_BODY_CHARS ? body : null;
  return {
    method,
    body: usable,
    bodyLength: body.length,
    paragraphCount,
    methodCategory,
  };
}

/**
 * Score AP body candidates: prefer enough paragraphs, then longest body.
 */
export function scoreApBodyCandidate(c: ApBodyCandidate): number {
  if (!c.body || c.bodyLength < 80) return 0;
  const paras = c.paragraphCount;
  const sufficientBonus =
    paras >= 5 ? 8_000 : paras >= 3 ? 3_000 : paras >= 2 ? 800 : 0;
  // Strongly prefer fuller story extracts over truncated first-block only.
  const lengthBonus = Math.min(c.bodyLength, 20_000);
  return lengthBonus + Math.min(paras, 40) * 200 + sufficientBonus;
}

export function pickBestApBodyCandidate(
  candidates: ApBodyCandidate[]
): ApBodyCandidate | null {
  let best: ApBodyCandidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = scoreApBodyCandidate(c);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best?.body ? best : null;
}

export function logApBodyCandidates(
  pageUrl: string,
  channel: "http" | "playwright" | "combined",
  candidates: ApBodyCandidate[],
  selected: ApBodyCandidate | null
): void {
  for (const c of candidates) {
    console.info("[from-link/extract] AP candidate", {
      url: pageUrl,
      channel,
      method: c.method,
      bodyLength: c.bodyLength,
      paragraphCount: c.paragraphCount,
      usable: Boolean(c.body),
    });
  }
  if (selected) {
    console.info("[from-link/extract] AP selected", {
      url: pageUrl,
      channel,
      method: selected.method,
      bodyLength: selected.bodyLength,
      paragraphCount: selected.paragraphCount,
      methodCategory: selected.methodCategory,
    });
    console.info("[from-link/extract] AP FINAL bodyLength/paragraphCount", {
      url: pageUrl,
      channel,
      method: selected.method,
      bodyLength: selected.bodyLength,
      paragraphCount: selected.paragraphCount,
    });
  } else {
    console.warn("[from-link/extract] AP selected none", {
      url: pageUrl,
      channel,
      candidateCount: candidates.length,
    });
  }
}

/**
 * Run all AP extraction strategies on one HTML document (no early exit).
 */
export function collectApBodyCandidates(input: {
  html: string;
  pageUrl: string;
  jsonLd: JsonLdArticleFields;
  channel: "http" | "playwright";
}): ApBodyCandidate[] {
  const prefix = input.channel === "playwright" ? "ap:playwright:" : "ap:";
  const doc = parseHtmlDocument(input.html, input.pageUrl).window.document;

  for (const node of doc.querySelectorAll(CHROME_SELECTOR)) {
    node.remove();
  }

  const fullStoryBlocks = extractApFullStoryBlocks(doc);

  const richRoots = [...doc.querySelectorAll(RICH_TEXT_ROOT)];
  const richPs: string[] = [];
  for (const root of richRoots) {
    richPs.push(...paragraphsFromNodes([...root.querySelectorAll("p")]));
  }

  const testIdParas: string[] = [];
  for (const root of richRoots.length ? richRoots : [doc.body].filter(Boolean)) {
    if (!root) continue;
    testIdParas.push(
      ...paragraphsFromNodes([
        ...root.querySelectorAll("[data-testid='paragraph']"),
      ])
    );
  }

  const articleEl = doc.querySelector("article") ?? doc.querySelector("main");
  const articleParas = articleEl
    ? paragraphsFromNodes([...articleEl.querySelectorAll("p")])
    : [];

  const candidates: ApBodyCandidate[] = [
    candidateFromParagraphs(
      `${prefix}Page-storyBody-full`,
      fullStoryBlocks,
      "article"
    ),
    candidateFromParagraphs(
      `${prefix}RichTextStoryBody-p`,
      richPs,
      "article"
    ),
    candidateFromParagraphs(
      `${prefix}data-testid-paragraph`,
      testIdParas,
      "article"
    ),
    candidateFromParagraphs(
      `${prefix}article-paragraphs`,
      articleParas,
      "article"
    ),
    candidateFromRawText(
      `${prefix}readability`,
      extractWithReadability(input.html, input.pageUrl),
      "generic"
    ),
    candidateFromRawText(
      `${prefix}jsonld`,
      input.jsonLd.articleBody,
      "jsonld"
    ),
  ];

  return candidates;
}
