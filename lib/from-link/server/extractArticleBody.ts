import "server-only";

import {
  ARTICLE_BODY_MAX_CHARS,
  BODY_EXTRACTION_FAILED_METHOD,
  BODY_PREVIEW_LOG_CHARS,
  MIN_USABLE_BODY_CHARS,
} from "../constants";
import { normalizePublishedAtToIso } from "../extractPublishedAt";
import { removeChromeFromHtml, stripHtmlToPlain } from "../htmlText";
import type {
  ArticleBodyExtractionResult,
  ExtractionStepLog,
  JsonLdArticleFields,
} from "./articleBodyTypes";
import { normalizeBody } from "./bodyNormalize";
import {
  countBodyParagraphs,
  resolvePublisherKey,
} from "./publisherExtractors/shared";
import { extractPublisherArticleBody } from "./publisherExtractors";
import {
  collectApBodyCandidates,
  logApBodyCandidates,
  pickBestApBodyCandidate,
} from "./publisherExtractors/apCandidates";
import type { BodyExtractMethodCategory } from "./publisherExtractors/types";
import { extractWithReadability } from "./extractReadability";

export type { ExtractionStepLog, JsonLdArticleFields, ArticleBodyExtractionResult };

const LOG_PREFIX = "[from-link/extract]";

export { normalizeBody };

function hostKey(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function scoreBody(text: string): number {
  if (!text) return 0;
  const paragraphs = countBodyParagraphs(text);
  return text.length + paragraphs * 80;
}

function pickBest(
  candidates: Array<{ method: string; body: string | null; methodCategory?: BodyExtractMethodCategory }>
): {
  method: string;
  body: string | null;
  methodCategory: BodyExtractMethodCategory;
} {
  let best: {
    method: string;
    body: string | null;
    score: number;
    methodCategory: BodyExtractMethodCategory;
  } = {
    method: "none",
    body: null,
    score: 0,
    methodCategory: "generic",
  };
  for (const c of candidates) {
    const body = c.body?.trim();
    if (!body || body.length < 80) continue;
    const s = scoreBody(body);
    if (s > best.score) {
      best = {
        method: c.method,
        body,
        score: s,
        methodCategory: c.methodCategory ?? "generic",
      };
    }
  }
  return {
    method: best.method,
    body: best.body,
    methodCategory: best.methodCategory,
  };
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

/** Legacy publisher hooks (Reuters, etc.) — AP/Fox/PBS/CSM use dedicated extractors. */
function extractLegacyPublisherBody(html: string, host: string): string | null {
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
      articleChunks.map((b, i) => ({
        method: `reuters-article-${i}`,
        body: b,
        methodCategory: "article" as const,
      }))
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

function resolveMethodCategory(method: string): BodyExtractMethodCategory {
  if (method.includes("jsonld") || method.includes("json-ld")) return "jsonld";
  if (
    method.includes("article") ||
    method.includes("container") ||
    method.includes("html-article") ||
    method.includes("publisher:")
  ) {
    return "article";
  }
  if (method.includes("og-description")) return "og-description";
  return "generic";
}

export function logArticleBodyExtraction(
  pageUrl: string,
  result: ArticleBodyExtractionResult,
  pageFetchMethod?: "http" | "playwright" | null
): void {
  const body = result.body ?? "";
  const extractChannel =
    pageFetchMethod === "playwright" ? "playwright" : result.methodCategory;

  console.log(`${LOG_PREFIX} FINAL SELECTED EXTRACTION`, {
    url: pageUrl,
    method: result.method,
    bodyLength: body.length,
    paragraphCount: result.paragraphCount,
    methodCategory: result.methodCategory,
    pageFetchMethod: pageFetchMethod ?? null,
    publisher: result.publisher,
    success: result.success,
  });

  console.log(LOG_PREFIX, {
    url: pageUrl,
    publisher: result.publisher,
    method: result.method,
    methodCategory: result.methodCategory,
    extractChannel,
    pageFetchMethod: pageFetchMethod ?? null,
    success: result.success,
    bodyLength: body.length,
    paragraphCount: result.paragraphCount,
    preview: body.slice(0, BODY_PREVIEW_LOG_CHARS),
    jsonLdHeadline: result.jsonLd.headline,
    jsonLdDatePublished: result.jsonLd.datePublished,
    steps: result.steps,
  });

  if (!result.success) {
    const failed = result.steps.filter((s) => !s.ok);
    console.warn(`${LOG_PREFIX} 본문 추출 실패`, {
      url: pageUrl,
      publisher: result.publisher,
      finalMethod: result.method,
      methodCategory: result.methodCategory,
      pageFetchMethod: pageFetchMethod ?? null,
      bodyLength: body.length,
      paragraphCount: result.paragraphCount,
      failedSteps: failed,
    });
  }
}

export function extractArticleBodyFromHtml(
  html: string,
  pageUrl: string,
  options?: { pageFetchMethod?: "http" | "playwright" | null }
): ArticleBodyExtractionResult {
  const host = hostKey(pageUrl);
  const publisherKey = resolvePublisherKey(pageUrl);
  const steps: ExtractionStepLog[] = [];
  const jsonLd = extractJsonLdArticleFields(html);

  // AP: evaluate every strategy on this HTML; never stop at first short hit.
  if (publisherKey === "ap") {
    const channel =
      options?.pageFetchMethod === "playwright" ? "playwright" : "http";
    const apCandidates = collectApBodyCandidates({
      html,
      pageUrl,
      jsonLd,
      channel,
    });
    for (const c of apCandidates) {
      steps.push({
        step: `${c.method}:p${c.paragraphCount}`,
        ok: Boolean(c.body),
        length: c.bodyLength,
        detail: c.body
          ? undefined
          : `need >= ${MIN_USABLE_BODY_CHARS} chars`,
      });
    }
    const selected = pickBestApBodyCandidate(apCandidates);
    logApBodyCandidates(pageUrl, channel, apCandidates, selected);

    const methodCategory =
      options?.pageFetchMethod === "playwright"
        ? "playwright"
        : selected?.methodCategory ?? "generic";

    const result: ArticleBodyExtractionResult = {
      body: selected?.body ?? null,
      method: selected?.body
        ? selected.method
        : BODY_EXTRACTION_FAILED_METHOD,
      methodCategory,
      steps,
      success: Boolean(selected?.body),
      jsonLd,
      publisher: "ap",
      paragraphCount: selected?.paragraphCount ?? 0,
    };
    logArticleBodyExtraction(pageUrl, result, options?.pageFetchMethod);
    return result;
  }

  const publisherResult = extractPublisherArticleBody({
    html,
    pageUrl,
    jsonLd,
  });

  if (publisherResult) {
    for (const s of publisherResult.steps) {
      steps.push(s);
    }
  }

  if (publisherResult?.success && publisherResult.body) {
    const methodCategory =
      options?.pageFetchMethod === "playwright"
        ? "playwright"
        : publisherResult.methodCategory;

    const result: ArticleBodyExtractionResult = {
      body: publisherResult.body,
      method: publisherResult.method,
      methodCategory,
      steps,
      success: true,
      jsonLd,
      publisher: publisherKey,
      paragraphCount: countBodyParagraphs(publisherResult.body),
    };
    logArticleBodyExtraction(pageUrl, result, options?.pageFetchMethod);
    return result;
  }

  const tryStep = (
    step: string,
    body: string | null,
    minChars = MIN_USABLE_BODY_CHARS,
    methodCategory: BodyExtractMethodCategory = "generic"
  ): { body: string | null; methodCategory: BodyExtractMethodCategory } => {
    const len = body?.trim().length ?? 0;
    const ok = len >= minChars;
    steps.push({
      step,
      ok,
      length: len,
      detail: ok ? undefined : `need >= ${minChars} chars`,
    });
    return ok
      ? { body: normalizeBody(body!), methodCategory }
      : { body: null, methodCategory };
  };

  const readability = tryStep(
    "readability",
    extractWithReadability(html, pageUrl),
    MIN_USABLE_BODY_CHARS,
    "generic"
  );

  const jsonLdStep = tryStep(
    "json-ld-articleBody",
    jsonLd.articleBody && jsonLd.articleBody.length >= MIN_USABLE_BODY_CHARS
      ? jsonLd.articleBody
      : null,
    MIN_USABLE_BODY_CHARS,
    "jsonld"
  );

  const legacyPublisher = tryStep(
    `publisher:${host}`,
    extractLegacyPublisherBody(html, host),
    MIN_USABLE_BODY_CHARS,
    "article"
  );

  const articleTag = tryStep("html-article-tag", extractArticleTag(html), MIN_USABLE_BODY_CHARS, "article");
  const mainBody = tryStep("html-main-tag", extractRoleMain(html), MIN_USABLE_BODY_CHARS, "article");
  const sectionBody = tryStep("html-section-tag", extractSectionTags(html), MIN_USABLE_BODY_CHARS, "article");
  const classBody = tryStep("html-class-patterns", extractFromClassPatterns(html), MIN_USABLE_BODY_CHARS, "article");
  const paragraphBody = tryStep(
    "html-paragraph-cluster",
    extractParagraphCluster(html),
    MIN_USABLE_BODY_CHARS,
    "article"
  );
  const fallbackBody = tryStep(
    "fallback-page-text",
    extractFallbackPageText(html),
    MIN_USABLE_BODY_CHARS,
    "generic"
  );

  const candidates = [
    { method: "readability", body: readability.body, methodCategory: readability.methodCategory },
    { method: "json-ld-articleBody", body: jsonLdStep.body, methodCategory: jsonLdStep.methodCategory },
    { method: `publisher:${host}`, body: legacyPublisher.body, methodCategory: legacyPublisher.methodCategory },
    { method: "html-article-tag", body: articleTag.body, methodCategory: articleTag.methodCategory },
    { method: "html-main-tag", body: mainBody.body, methodCategory: mainBody.methodCategory },
    { method: "html-section-tag", body: sectionBody.body, methodCategory: sectionBody.methodCategory },
    { method: "html-class-patterns", body: classBody.body, methodCategory: classBody.methodCategory },
    { method: "html-paragraph-cluster", body: paragraphBody.body, methodCategory: paragraphBody.methodCategory },
    { method: "fallback-page-text", body: fallbackBody.body, methodCategory: fallbackBody.methodCategory },
  ];

  const best = pickBest(candidates);
  const normalizedBody = best.body ? normalizeBody(best.body) : null;
  const success = Boolean(
    normalizedBody && normalizedBody.length >= MIN_USABLE_BODY_CHARS
  );

  let methodCategory = success
    ? best.methodCategory
  : resolveMethodCategory(best.method);

  if (success && options?.pageFetchMethod === "playwright") {
    methodCategory = "playwright";
  }

  const result: ArticleBodyExtractionResult = {
    body: success ? normalizedBody : null,
    method: success ? best.method : BODY_EXTRACTION_FAILED_METHOD,
    methodCategory,
    steps,
    success,
    jsonLd,
    publisher: publisherKey,
    paragraphCount: countBodyParagraphs(success ? normalizedBody : null),
  };

  logArticleBodyExtraction(pageUrl, result, options?.pageFetchMethod);
  return result;
}
