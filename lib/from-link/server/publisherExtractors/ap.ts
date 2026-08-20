import type { PublisherExtractStep, PublisherExtractor } from "./types";
import {
  buildPublisherResult,
  parseHtmlDocument,
  pushStep,
  readOgDescription,
  tryDomSelectors,
  tryHtmlPattern,
} from "./shared";

const AP_SELECTORS = [
  "div.RichTextStoryBody",
  "div[class*='RichTextStoryBody']",
  "div[class*='StoryBody']",
  "div[data-key='story']",
  "article",
  "main",
];

export const apPublisherExtractor: PublisherExtractor = {
  key: "ap",
  hostPatterns: [/apnews\.com$/i],
  extract(ctx) {
    const steps: PublisherExtractStep[] = [];
    const doc = parseHtmlDocument(ctx.html, ctx.pageUrl).window.document;

    const jsonLdBody = ctx.jsonLd.articleBody?.trim() ?? "";
    pushStep(steps, "ap:json-ld-articleBody", jsonLdBody.length);
    if (jsonLdBody.length >= 400) {
      return buildPublisherResult({
        publisher: "ap",
        body: jsonLdBody,
        method: "ap:jsonld",
        methodCategory: "jsonld",
        steps,
      });
    }

    const dom = tryDomSelectors(doc, AP_SELECTORS);
    pushStep(
      steps,
      dom.selector ? `ap:container:${dom.selector}` : "ap:container",
      dom.length
    );
    if (dom.body) {
      return buildPublisherResult({
        publisher: "ap",
        body: dom.body,
        method: "ap:article",
        methodCategory: "article",
        steps,
      });
    }

    const richTextHtml = tryHtmlPattern(
      ctx.html,
      /<div[^>]+class=["'][^"']*RichTextStoryBody[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i
    );
    pushStep(steps, "ap:html-RichTextStoryBody", richTextHtml.length);
    if (richTextHtml.body) {
      return buildPublisherResult({
        publisher: "ap",
        body: richTextHtml.body,
        method: "ap:article",
        methodCategory: "article",
        steps,
      });
    }

    const og = readOgDescription(ctx.html);
    pushStep(steps, "ap:og-description", og?.length ?? 0, 400);
    if (og && og.length >= 400) {
      return buildPublisherResult({
        publisher: "ap",
        body: og,
        method: "ap:og-description",
        methodCategory: "og-description",
        steps,
      });
    }

    return buildPublisherResult({
      publisher: "ap",
      body: null,
      method: "ap:failed",
      methodCategory: "generic",
      steps,
    });
  },
};
