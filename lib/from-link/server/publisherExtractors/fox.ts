import type { PublisherExtractStep, PublisherExtractor } from "./types";
import {
  buildPublisherResult,
  parseHtmlDocument,
  pushStep,
  readOgDescription,
  tryDomSelectors,
} from "./shared";

const FOX_SELECTORS = [
  "div.article-body",
  "div.article-content",
  "[itemprop='articleBody']",
  "article .content",
  "article",
];

export const foxPublisherExtractor: PublisherExtractor = {
  key: "fox",
  hostPatterns: [/foxnews\.com$/i],
  extract(ctx) {
    const steps: PublisherExtractStep[] = [];

    const jsonLdBody = ctx.jsonLd.articleBody?.trim() ?? "";
    pushStep(steps, "fox:json-ld-articleBody", jsonLdBody.length);
    if (jsonLdBody.length >= 400) {
      return buildPublisherResult({
        publisher: "fox",
        body: jsonLdBody,
        method: "fox:jsonld",
        methodCategory: "jsonld",
        steps,
      });
    }

    const doc = parseHtmlDocument(ctx.html, ctx.pageUrl).window.document;
    const dom = tryDomSelectors(doc, FOX_SELECTORS);
    pushStep(
      steps,
      dom.selector ? `fox:container:${dom.selector}` : "fox:container",
      dom.length
    );
    if (dom.body) {
      return buildPublisherResult({
        publisher: "fox",
        body: dom.body,
        method: "fox:article",
        methodCategory: "article",
        steps,
      });
    }

    const og = readOgDescription(ctx.html);
    pushStep(steps, "fox:og-description", og?.length ?? 0, 400);
    if (og && og.length >= 400) {
      return buildPublisherResult({
        publisher: "fox",
        body: og,
        method: "fox:og-description",
        methodCategory: "og-description",
        steps,
      });
    }

    return buildPublisherResult({
      publisher: "fox",
      body: null,
      method: "fox:failed",
      methodCategory: "generic",
      steps,
    });
  },
};
