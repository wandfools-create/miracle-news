import type { PublisherExtractStep, PublisherExtractor } from "./types";
import { buildPublisherResult, pushStep } from "./shared";
import {
  collectApBodyCandidates,
  logApBodyCandidates,
  pickBestApBodyCandidate,
} from "./apCandidates";

/**
 * AP extractor: evaluate multiple strategies and pick the most complete body.
 * Does not stop at the first short success.
 */
export const apPublisherExtractor: PublisherExtractor = {
  key: "ap",
  hostPatterns: [/apnews\.com$/i],
  extract(ctx) {
    const steps: PublisherExtractStep[] = [];
    const candidates = collectApBodyCandidates({
      html: ctx.html,
      pageUrl: ctx.pageUrl,
      jsonLd: ctx.jsonLd,
      channel: "http",
    });

    for (const c of candidates) {
      pushStep(
        steps,
        `${c.method}:p${c.paragraphCount}`,
        c.bodyLength,
        400
      );
    }

    const selected = pickBestApBodyCandidate(candidates);
    logApBodyCandidates(ctx.pageUrl, "http", candidates, selected);

    if (selected?.body) {
      return buildPublisherResult({
        publisher: "ap",
        body: selected.body,
        method: selected.method,
        methodCategory: selected.methodCategory,
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
