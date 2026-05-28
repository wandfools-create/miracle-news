import "server-only";

import {
  ARTICLE_BODY_MAX_CHARS,
  BODY_EXTRACTION_FAILED_METHOD,
  BODY_PREVIEW_LOG_CHARS,
  MIN_USABLE_BODY_CHARS,
} from "../constants";
import { normalizePublishedAtToIso } from "../extractPublishedAt";
import { removeChromeFromHtml, stripHtmlToPlain } from "../htmlText";
import { extractWithReadability } from "./extractReadability";

const LOG_PREFIX = "[from-link/extract]";

export type ExtractionStepLog = {
  step: string;
  ok: boolean;
  length: number;
  detail?: string;
};

export type JsonLdArticleFields = {
  articleBody: string | null;
  headline: string | null;
  datePublished: string | null;
};

export type ArticleBodyExtractionResult = {
  body: string | null;
  method: string;
  steps: ExtractionStepLog[];
  /** True when body meets MIN_USABLE_BODY_CHARS (not meta description). */
  success: boolean;
  jsonLd: JsonLdArticleFields;
};

function hostKey(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeBody(
  text: string,
  maxLen = ARTICLE_BODY_MAX_CHARS
): string {
  const plain = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1)}…`;
}

function scoreBody(text: string): number {
  if (!text) return 0;
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 50);
  return text.length + paragraphs.length * 80;
}

function pickBest(
  candidates: Array<{ method: string; body: string | null }>
): { method: string; body: string | null } {
  let best: { method: string; body: string | null; score: number } = {
    method: "none",
    body: null,
    score: 0,
  };
  for (const c of candidates) {
    const body = c.body?.trim();
    if (!body || body.length < 80) continue;
    const s = scoreBody(body);
    if (s > best.score) {
      best = { method: c.method, body, score: s };
    }
  }
  return { method: best.method, body: best.body };
}

function isArticleType(types: string[]): boolean {
  return types.some((t) =>
    /NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle|BlogPosting/i.test(
      t
    )
  );
}

export function extractJsonLdArticleFields(html: string): JsonLdArticleFields {
  const result: JsonLdArticleFields = {
    articleBody: null,
    headline: null,
    datePublished: null,
  };
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      collectJsonLdFields(JSON.parse(raw), result);
    } catch {
      /* invalid JSON-LD */
    }
  }
  return result;
}

function mergeJsonLdField(
  current: string | null,
  next: string | null,
  preferLonger = false
): string | null {
  if (!next) return current;
  if (!current) return next;
  if (preferLonger && next.length > current.length) return next;
  if (!preferLonger) return current;
  return current;
}

function collectJsonLdFields(
  node: unknown,
  out: JsonLdArticleFields
): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdFields(item, out);
    return;
  }
  if (typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    collectJsonLdFields(obj["@graph"], out);
  }

  const typeVal = obj["@type"];
  const types = Array.isArray(typeVal)
    ? typeVal.map(String)
    : typeVal
      ? [String(typeVal)]
      : [];

  if (isArticleType(types)) {
    const bodyRaw = obj.articleBody;
    if (typeof bodyRaw === "string" && bodyRaw.trim().length > 0) {
      const plain = stripHtmlToPlain(bodyRaw, ARTICLE_BODY_MAX_CHARS);
      out.articleBody = mergeJsonLdField(out.articleBody, plain, true);
    }

    const headlineRaw = obj.headline ?? obj.name;
    if (typeof headlineRaw === "string" && headlineRaw.trim()) {
      out.headline = mergeJsonLdField(
        out.headline,
        headlineRaw.trim().replace(/\s+/g, " ")
      );
    }

    for (const key of ["datePublished", "dateModified", "dateCreated"]) {
      const dateRaw = obj[key];
      if (typeof dateRaw === "string" && dateRaw.trim()) {
        const iso = normalizePublishedAtToIso(dateRaw);
        if (iso) {
          out.datePublished = out.datePublished ?? iso;
          break;
        }
      }
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      collectJsonLdFields(value, out);
    }
  }
}

function extractTagBlocks(html: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(
    `<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "gi"
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[2]) blocks.push(match[2]);
  }
  return blocks;
}

function extractByAttributePattern(
  html: string,
  pattern: RegExp
): string | null {
  const match = html.match(pattern);
  if (!match?.[1]) return null;
  return stripHtmlToPlain(match[1], ARTICLE_BODY_MAX_CHARS);
}

function extractAllByPattern(html: string, pattern: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const flags = pattern.flags.includes("g")
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);
  while ((m = flags.exec(html))) {
    if (m[1]) {
      const t = stripHtmlToPlain(m[1], 8000);
      if (t.length > 40) out.push(t);
    }
  }
  return out;
}

function extractPublisherBody(html: string, host: string): string | null {
  if (host.includes("reuters.com")) {
    const paragraphs = extractAllByPattern(
      html,
      /<(?:div|p)[^>]+data-testid=["']paragraph["'][^>]*>([\s\S]*?)<\/(?:div|p)>/gi
    );
    if (paragraphs.length >= 2) {
      return normalizeBody(paragraphs.join("\n\n"));
    }

    const articleChunks = extractAllByPattern(
      html,
      /<article[^>]*data-testid=["']Article["'][^>]*>([\s\S]*?)<\/article>/gi
    );
    const bestArticle = pickBest(
      articleChunks.map((b, i) => ({ method: `reuters-article-${i}`, body: b }))
    );
    if (bestArticle.body && bestArticle.body.length >= MIN_USABLE_BODY_CHARS) {
      return normalizeBody(bestArticle.body);
    }

    const legacy = extractByAttributePattern(
      html,
      /<div[^>]+class=["'][^"']*\barticle-body__content__[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    if (legacy && legacy.length >= MIN_USABLE_BODY_CHARS) return legacy;
  }

  if (host.includes("foxnews.com")) {
    const selectors = [
      /<div[^>]+class=["'][^"']*\barticle-body\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*\barticle-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/div>/i,
    ];
    for (const pattern of selectors) {
      const body = extractByAttributePattern(html, pattern);
      if (body && body.length >= MIN_USABLE_BODY_CHARS) return body;
    }

    const articleBlocks = extractTagBlocks(html, "article")
      .map((b) => stripHtmlToPlain(b, ARTICLE_BODY_MAX_CHARS))
      .filter((b) => b.length >= MIN_USABLE_BODY_CHARS);
    if (articleBlocks.length) {
      return articleBlocks.sort((a, b) => b.length - a.length)[0] ?? null;
    }
  }

  if (host.includes("apnews.com")) {
    const selectors = [
      /<div[^>]+class=["'][^"']*RichTextStoryBody[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*StoryBody[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*Article[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
    ];
    for (const pattern of selectors) {
      const body = extractByAttributePattern(html, pattern);
      if (body && body.length >= MIN_USABLE_BODY_CHARS) return body;
    }

    const apParagraphs = extractAllByPattern(
      html,
      /<p[^>]+class=["'][^"']*RichTextStoryBody[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi
    );
    if (apParagraphs.length >= 3) {
      return normalizeBody(apParagraphs.join("\n\n"));
    }
  }

  return null;
}

function extractFromClassPatterns(html: string): string | null {
  const classPatterns = [
    /class=["'][^"']*\barticle-body\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /class=["'][^"']*\bstory-body\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /class=["'][^"']*\bArticleBody\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /class=["'][^"']*\bpost-content\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /itemprop=["']articleBody["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /id=["']article-body["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
    /id=["']story-body["'][^>]*>([\s\S]*?)<\/(?:div|section|article)>/i,
  ];

  for (const pattern of classPatterns) {
    const body = extractByAttributePattern(html, pattern);
    if (body && body.length >= MIN_USABLE_BODY_CHARS) return body;
  }
  return null;
}

function extractSectionTags(html: string): string | null {
  const sections = extractTagBlocks(html, "section")
    .map((b) => stripHtmlToPlain(b, ARTICLE_BODY_MAX_CHARS))
    .filter((b) => b.length >= MIN_USABLE_BODY_CHARS);
  if (!sections.length) return null;
  return sections.sort((a, b) => b.length - a.length)[0] ?? null;
}

function extractParagraphCluster(html: string): string | null {
  const chunks: string[] = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = pRe.exec(html))) {
    const t = stripHtmlToPlain(match[1], 2000);
    if (t.length >= 60) chunks.push(t);
  }
  if (chunks.length < 3) return null;
  const body = normalizeBody(chunks.join("\n\n"));
  return body.length >= MIN_USABLE_BODY_CHARS ? body : null;
}

function extractRoleMain(html: string): string | null {
  const mainBlocks = [
    ...extractTagBlocks(html, "main"),
    ...(html.match(
      /<[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
    )?.map((block) => block.match(/>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "") ?? []),
  ];

  const bodies = mainBlocks
    .map((b) => stripHtmlToPlain(b, ARTICLE_BODY_MAX_CHARS))
    .filter((b) => b.length >= MIN_USABLE_BODY_CHARS);
  if (!bodies.length) return null;
  return bodies.sort((a, b) => b.length - a.length)[0] ?? null;
}

function extractArticleTag(html: string): string | null {
  const articles = extractTagBlocks(html, "article")
    .map((b) => stripHtmlToPlain(b, ARTICLE_BODY_MAX_CHARS))
    .filter((b) => b.length >= MIN_USABLE_BODY_CHARS);
  if (!articles.length) return null;
  return articles.sort((a, b) => b.length - a.length)[0] ?? null;
}

function extractFallbackPageText(html: string): string | null {
  const cleaned = removeChromeFromHtml(html);
  const body = stripHtmlToPlain(cleaned, ARTICLE_BODY_MAX_CHARS);
  return body.length >= MIN_USABLE_BODY_CHARS ? body : null;
}

export function logArticleBodyExtraction(
  pageUrl: string,
  result: ArticleBodyExtractionResult
): void {
  const body = result.body ?? "";
  console.log(LOG_PREFIX, {
    url: pageUrl,
    method: result.method,
    success: result.success,
    bodyLength: body.length,
    preview: body.slice(0, BODY_PREVIEW_LOG_CHARS),
    jsonLdHeadline: result.jsonLd.headline,
    jsonLdDatePublished: result.jsonLd.datePublished,
    steps: result.steps,
  });

  if (!result.success) {
    const failed = result.steps.filter((s) => !s.ok);
    console.warn(`${LOG_PREFIX} 본문 추출 실패`, {
      url: pageUrl,
      finalMethod: result.method,
      bodyLength: body.length,
      failedSteps: failed,
    });
  }
}

export function extractArticleBodyFromHtml(
  html: string,
  pageUrl: string
): ArticleBodyExtractionResult {
  const host = hostKey(pageUrl);
  const steps: ExtractionStepLog[] = [];
  const jsonLd = extractJsonLdArticleFields(html);

  const tryStep = (
    step: string,
    body: string | null,
    minChars = MIN_USABLE_BODY_CHARS
  ): string | null => {
    const len = body?.trim().length ?? 0;
    const ok = len >= minChars;
    steps.push({
      step,
      ok,
      length: len,
      detail: ok ? undefined : `need >= ${minChars} chars`,
    });
    return ok ? normalizeBody(body!) : null;
  };

  const readabilityBody = tryStep(
    "readability",
    extractWithReadability(html, pageUrl)
  );

  const jsonLdBody = tryStep(
    "json-ld-articleBody",
    jsonLd.articleBody && jsonLd.articleBody.length >= MIN_USABLE_BODY_CHARS
      ? jsonLd.articleBody
      : null
  );

  const publisherBody = tryStep(
    `publisher:${host}`,
    extractPublisherBody(html, host)
  );

  const articleTagBody = tryStep("html-article-tag", extractArticleTag(html));

  const mainBody = tryStep("html-main-tag", extractRoleMain(html));

  const sectionBody = tryStep("html-section-tag", extractSectionTags(html));

  const classBody = tryStep("html-class-patterns", extractFromClassPatterns(html));

  const paragraphBody = tryStep(
    "html-paragraph-cluster",
    extractParagraphCluster(html)
  );

  const fallbackBody = tryStep(
    "fallback-page-text",
    extractFallbackPageText(html)
  );

  const candidates = [
    { method: "readability", body: readabilityBody },
    { method: "json-ld-articleBody", body: jsonLdBody },
    { method: `publisher:${host}`, body: publisherBody },
    { method: "html-article-tag", body: articleTagBody },
    { method: "html-main-tag", body: mainBody },
    { method: "html-section-tag", body: sectionBody },
    { method: "html-class-patterns", body: classBody },
    { method: "html-paragraph-cluster", body: paragraphBody },
    { method: "fallback-page-text", body: fallbackBody },
  ];

  const best = pickBest(candidates);
  const normalizedBody = best.body ? normalizeBody(best.body) : null;
  const success = Boolean(
    normalizedBody && normalizedBody.length >= MIN_USABLE_BODY_CHARS
  );

  const result: ArticleBodyExtractionResult = {
    body: success ? normalizedBody : null,
    method: success ? best.method : BODY_EXTRACTION_FAILED_METHOD,
    steps,
    success,
    jsonLd,
  };

  logArticleBodyExtraction(pageUrl, result);
  return result;
}
