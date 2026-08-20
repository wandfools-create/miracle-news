import type { PublisherExtractStep, PublisherExtractor } from "./types";
import {
  buildPublisherResult,
  parseHtmlDocument,
  pushStep,
  readOgDescription,
  tryDomSelector,
  tryDomSelectors,
} from "./shared";
import { normalizeBody } from "../bodyNormalize";
import { ARTICLE_BODY_MAX_CHARS, MIN_USABLE_BODY_CHARS } from "../../constants";

const PBS_SELECTORS = [
  "div.body-text",
  "div.post__article",
  "article.post",
  "div.page__body article",
  "main article",
];

function extractPbsStoryBlocks(doc: Document): { body: string | null; length: number } {
  const blocks = [...doc.querySelectorAll("div.story-block")]
    .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((t) => t.length >= 60);
  if (blocks.length < 2) return { body: null, length: 0 };
  const body = normalizeBody(blocks.join("\n\n"), ARTICLE_BODY_MAX_CHARS);
  return {
    body: body.length >= MIN_USABLE_BODY_CHARS ? body : null,
    length: body.length,
  };
}

export const pbsPublisherExtractor: PublisherExtractor = {
  key: "pbs",
  hostPatterns: [/pbs\.org$/i],
  extract(ctx) {
    const steps: PublisherExtractStep[] = [];
    const doc = parseHtmlDocument(ctx.html, ctx.pageUrl).window.document;

    const jsonLdBody = ctx.jsonLd.articleBody?.trim() ?? "";
    pushStep(steps, "pbs:json-ld-articleBody", jsonLdBody.length);
    if (jsonLdBody.length >= 400) {
      return buildPublisherResult({
        publisher: "pbs",
        body: jsonLdBody,
        method: "pbs:jsonld",
        methodCategory: "jsonld",
        steps,
      });
    }

    const dom = tryDomSelectors(doc, PBS_SELECTORS);
    pushStep(
      steps,
      dom.selector ? `pbs:container:${dom.selector}` : "pbs:container",
      dom.length
    );
    if (dom.body) {
      return buildPublisherResult({
        publisher: "pbs",
        body: dom.body,
        method: "pbs:article",
        methodCategory: "article",
        steps,
      });
    }

    const storyBlocks = extractPbsStoryBlocks(doc);
    pushStep(steps, "pbs:story-block-cluster", storyBlocks.length);
    if (storyBlocks.body) {
      return buildPublisherResult({
        publisher: "pbs",
        body: storyBlocks.body,
        method: "pbs:article",
        methodCategory: "article",
        steps,
      });
    }

    const mainBody = tryDomSelector(doc, "main");
    pushStep(steps, "pbs:main", mainBody.length);
    if (mainBody.body) {
      return buildPublisherResult({
        publisher: "pbs",
        body: mainBody.body,
        method: "pbs:article",
        methodCategory: "article",
        steps,
      });
    }

    const og = readOgDescription(ctx.html);
    pushStep(steps, "pbs:og-description", og?.length ?? 0, 400);
    if (og && og.length >= 400) {
      return buildPublisherResult({
        publisher: "pbs",
        body: og,
        method: "pbs:og-description",
        methodCategory: "og-description",
        steps,
      });
    }

    return buildPublisherResult({
      publisher: "pbs",
      body: null,
      method: "pbs:failed",
      methodCategory: "generic",
      steps,
    });
  },
};
