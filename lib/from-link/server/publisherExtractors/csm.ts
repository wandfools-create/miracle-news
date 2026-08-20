import type { PublisherExtractStep, PublisherExtractor } from "./types";
import {
  buildPublisherResult,
  parseHtmlDocument,
  pushStep,
  readOgDescription,
  tryDomSelectors,
} from "./shared";

const CSM_SELECTORS = [
  "div.eza-body",
  "div.eza-body article",
  "article",
  "div.story-body",
  "div[class*='article__body']",
  "main",
];

export const csmPublisherExtractor: PublisherExtractor = {
  key: "csm",
  hostPatterns: [/csmonitor\.com$/i],
  extract(ctx) {
    const steps: PublisherExtractStep[] = [];

    const jsonLdBody = ctx.jsonLd.articleBody?.trim() ?? "";
    pushStep(steps, "csm:json-ld-articleBody", jsonLdBody.length);
    if (jsonLdBody.length >= 400) {
      return buildPublisherResult({
        publisher: "csm",
        body: jsonLdBody,
        method: "csm:jsonld",
        methodCategory: "jsonld",
        steps,
      });
    }

    const doc = parseHtmlDocument(ctx.html, ctx.pageUrl).window.document;
    const dom = tryDomSelectors(doc, CSM_SELECTORS);
    pushStep(
      steps,
      dom.selector ? `csm:container:${dom.selector}` : "csm:container",
      dom.length
    );
    if (dom.body) {
      return buildPublisherResult({
        publisher: "csm",
        body: dom.body,
        method: "csm:article",
        methodCategory: "article",
        steps,
      });
    }

    const og = readOgDescription(ctx.html);
    pushStep(steps, "csm:og-description", og?.length ?? 0, 400);
    if (og && og.length >= 400) {
      return buildPublisherResult({
        publisher: "csm",
        body: og,
        method: "csm:og-description",
        methodCategory: "og-description",
        steps,
      });
    }

    return buildPublisherResult({
      publisher: "csm",
      body: null,
      method: "csm:failed",
      methodCategory: "generic",
      steps,
    });
  },
};
