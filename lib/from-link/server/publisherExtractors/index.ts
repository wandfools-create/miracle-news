import type { JsonLdArticleFields } from "../articleBodyTypes";
import { apPublisherExtractor } from "./ap";
import { csmPublisherExtractor } from "./csm";
import { foxPublisherExtractor } from "./fox";
import { pbsPublisherExtractor } from "./pbs";
import { hostKey, resolvePublisherKey } from "./shared";
import type {
  PublisherExtractResult,
  PublisherExtractor,
  PublisherKey,
} from "./types";

const EXTRACTORS: PublisherExtractor[] = [
  apPublisherExtractor,
  foxPublisherExtractor,
  pbsPublisherExtractor,
  csmPublisherExtractor,
];

export function getPublisherExtractor(
  pageUrl: string
): PublisherExtractor | null {
  const key = resolvePublisherKey(pageUrl);
  if (!key) return null;
  return EXTRACTORS.find((e) => e.key === key) ?? null;
}

export function extractPublisherArticleBody(input: {
  html: string;
  pageUrl: string;
  jsonLd: JsonLdArticleFields;
}): PublisherExtractResult | null {
  const extractor = getPublisherExtractor(input.pageUrl);
  if (!extractor) return null;

  return extractor.extract({
    html: input.html,
    pageUrl: input.pageUrl,
    jsonLd: input.jsonLd,
  });
}

export function playwrightWaitSelectorForUrl(pageUrl: string): string {
  const key = resolvePublisherKey(pageUrl);
  switch (key) {
    case "fox":
      return "div.article-body p, article p";
    case "ap":
      return "div.RichTextStoryBody p, div[class*='RichTextStoryBody'] p";
    case "pbs":
      return "div.body-text p, div.story-block";
    case "csm":
      return "div.eza-body p, article p";
    default:
      return "article p, main p, [role='main'] p";
  }
}

export { resolvePublisherKey, hostKey };
export type { PublisherKey, PublisherExtractResult };
