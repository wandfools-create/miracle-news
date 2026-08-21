import "server-only";

import { fetchHtmlDocument } from "./httpFetch";
import { extractJsonLdArticleFields } from "./server/extractArticleBody";
import { extractArticleBodyFromHtml } from "./server/extractArticleBody";
import { fetchRenderedHtmlWithPlaywright } from "./server/fetchRenderedHtml";
import {
  collectApBodyCandidates,
  logApBodyCandidates,
  pickBestApBodyCandidate,
  scoreApBodyCandidate,
  type ApBodyCandidate,
} from "./server/publisherExtractors/apCandidates";
import { resolvePublisherKey } from "./server/publisherExtractors/shared";
import type { FromLinkExtractionStats } from "./fromLinkDiagnostics";

export type PageFetchMethod = "http" | "playwright";

export type PageHtmlForExtraction = {
  html: string | null;
  finalUrl: string;
  pageFetchMethod: PageFetchMethod | null;
  status: number | null;
  error: string | null;
  extractionStats: FromLinkExtractionStats;
};

function bodyProbe(
  html: string,
  pageUrl: string,
  pageFetchMethod: PageFetchMethod | null
) {
  return extractArticleBodyFromHtml(html, pageUrl, { pageFetchMethod });
}

function emptyExtractionStats(): FromLinkExtractionStats {
  return {
    httpBodyChars: 0,
    httpExtractSuccess: false,
    httpExtractMethod: null,
    playwrightBodyChars: 0,
    playwrightExtractSuccess: false,
    playwrightExtractMethod: null,
  };
}

function statsFromProbe(
  stats: FromLinkExtractionStats,
  channel: "http" | "playwright",
  probe: ReturnType<typeof bodyProbe>
): FromLinkExtractionStats {
  const len = probe.body?.length ?? 0;
  if (channel === "http") {
    return {
      ...stats,
      httpBodyChars: len,
      httpExtractSuccess: probe.success,
      httpExtractMethod: probe.method,
    };
  }
  return {
    ...stats,
    playwrightBodyChars: len,
    playwrightExtractSuccess: probe.success,
    playwrightExtractMethod: probe.method,
  };
}

/**
 * AP: always run HTTP + Playwright candidates and keep the HTML that wins.
 */
async function fetchApPageHtmlForExtraction(
  pageUrl: string
): Promise<PageHtmlForExtraction> {
  let stats = emptyExtractionStats();
  const allCandidates: ApBodyCandidate[] = [];

  const http = await fetchHtmlDocument(pageUrl);
  let httpBest: ApBodyCandidate | null = null;

  if (http.html) {
    const jsonLd = extractJsonLdArticleFields(http.html);
    const httpCandidates = collectApBodyCandidates({
      html: http.html,
      pageUrl: http.finalUrl,
      jsonLd,
      channel: "http",
    });
    allCandidates.push(...httpCandidates);
    httpBest = pickBestApBodyCandidate(httpCandidates);
    logApBodyCandidates(pageUrl, "http", httpCandidates, httpBest);
    stats = {
      ...stats,
      httpBodyChars: httpBest?.bodyLength ?? 0,
      httpExtractSuccess: Boolean(httpBest?.body),
      httpExtractMethod: httpBest?.method ?? null,
    };
  } else {
    console.warn("[from-link/extract] AP HTTP fetch failed — still trying Playwright", {
      url: pageUrl,
      status: http.status,
      error: http.error,
    });
  }

  const rendered = await fetchRenderedHtmlWithPlaywright(pageUrl);
  let pwBest: ApBodyCandidate | null = null;

  if (rendered.html) {
    const jsonLd = extractJsonLdArticleFields(rendered.html);
    const pwCandidates = collectApBodyCandidates({
      html: rendered.html,
      pageUrl: rendered.finalUrl,
      jsonLd,
      channel: "playwright",
    });
    allCandidates.push(...pwCandidates);
    pwBest = pickBestApBodyCandidate(pwCandidates);
    logApBodyCandidates(pageUrl, "playwright", pwCandidates, pwBest);
    stats = {
      ...stats,
      playwrightBodyChars: pwBest?.bodyLength ?? 0,
      playwrightExtractSuccess: Boolean(pwBest?.body),
      playwrightExtractMethod: pwBest?.method ?? null,
    };
  } else {
    console.warn("[from-link/extract] AP Playwright failed", {
      url: pageUrl,
      error: rendered.error,
    });
  }

  const combinedBest = pickBestApBodyCandidate(allCandidates);
  logApBodyCandidates(pageUrl, "combined", allCandidates, combinedBest);

  const preferPlaywright =
    combinedBest &&
    pwBest &&
    scoreApBodyCandidate(pwBest) >= scoreApBodyCandidate(httpBest ?? {
      method: "none",
      body: null,
      bodyLength: 0,
      paragraphCount: 0,
      methodCategory: "generic",
    });

  if (preferPlaywright && rendered.html) {
    console.info("[from-link/extract] AP using Playwright HTML (best body)", {
      url: pageUrl,
      method: combinedBest?.method,
      bodyLength: combinedBest?.bodyLength ?? 0,
      paragraphCount: combinedBest?.paragraphCount ?? 0,
    });
    return {
      html: rendered.html,
      finalUrl: rendered.finalUrl,
      pageFetchMethod: "playwright",
      status: null,
      error: rendered.error,
      extractionStats: stats,
    };
  }

  if (http.html) {
    console.info("[from-link/extract] AP using HTTP HTML (best body)", {
      url: pageUrl,
      method: combinedBest?.method ?? httpBest?.method,
      bodyLength: combinedBest?.bodyLength ?? httpBest?.bodyLength ?? 0,
      paragraphCount:
        combinedBest?.paragraphCount ?? httpBest?.paragraphCount ?? 0,
    });
    return {
      html: http.html,
      finalUrl: http.finalUrl,
      pageFetchMethod: "http",
      status: http.status,
      error: rendered.error,
      extractionStats: stats,
    };
  }

  return {
    html: null,
    finalUrl: pageUrl,
    pageFetchMethod: null,
    status: http.status,
    error: rendered.error ?? http.error ?? "fetch failed",
    extractionStats: stats,
  };
}

/**
 * Fetch article HTML: plain HTTP first, then Playwright when fetch fails or body is insufficient.
 * AP always compares HTTP vs Playwright extraction candidates.
 */
export async function fetchPageHtmlForExtraction(
  pageUrl: string
): Promise<PageHtmlForExtraction> {
  if (resolvePublisherKey(pageUrl) === "ap") {
    return fetchApPageHtmlForExtraction(pageUrl);
  }

  let stats = emptyExtractionStats();

  const http = await fetchHtmlDocument(pageUrl);

  if (http.html) {
    const probe = bodyProbe(http.html, http.finalUrl, "http");
    stats = statsFromProbe(stats, "http", probe);

    if (probe.success) {
      console.log("[from-link/extract] HTTP fetch succeeded with usable body", {
        url: pageUrl,
        bodyLength: probe.body?.length ?? 0,
        paragraphCount: probe.paragraphCount,
        extractMethod: probe.method,
        methodCategory: probe.methodCategory,
        publisher: probe.publisher,
      });
      return {
        html: http.html,
        finalUrl: http.finalUrl,
        pageFetchMethod: "http",
        status: http.status,
        error: null,
        extractionStats: stats,
      };
    }

    console.log(
      "[from-link/extract] HTTP HTML received but body insufficient — trying Playwright",
      {
        url: pageUrl,
        bodyLength: probe.body?.length ?? 0,
        paragraphCount: probe.paragraphCount,
        extractMethod: probe.method,
        methodCategory: probe.methodCategory,
        publisher: probe.publisher,
        failedSteps: probe.steps.filter((s) => !s.ok),
      }
    );
  } else {
    console.warn("[from-link/extract] HTTP fetch failed — trying Playwright", {
      url: pageUrl,
      status: http.status,
      error: http.error,
    });
  }

  const rendered = await fetchRenderedHtmlWithPlaywright(pageUrl);

  if (rendered.html) {
    const pwProbe = bodyProbe(rendered.html, rendered.finalUrl, "playwright");
    stats = statsFromProbe(stats, "playwright", pwProbe);

    if (pwProbe.success) {
      console.log("[from-link/extract] Playwright succeeded with usable body", {
        url: pageUrl,
        bodyLength: pwProbe.body?.length ?? 0,
        paragraphCount: pwProbe.paragraphCount,
        extractMethod: pwProbe.method,
        methodCategory: pwProbe.methodCategory,
        publisher: pwProbe.publisher,
      });
    } else {
      console.warn(
        "[from-link/extract] Playwright HTML loaded but body still insufficient",
        {
          url: pageUrl,
          bodyLength: pwProbe.body?.length ?? 0,
          extractMethod: pwProbe.method,
          playwrightError: rendered.error,
        }
      );
    }

    return {
      html: rendered.html,
      finalUrl: rendered.finalUrl,
      pageFetchMethod: "playwright",
      status: null,
      error: rendered.error,
      extractionStats: stats,
    };
  }

  if (http.html) {
    return {
      html: http.html,
      finalUrl: http.finalUrl,
      pageFetchMethod: "http",
      status: http.status,
      error: rendered.error ?? http.error,
      extractionStats: stats,
    };
  }

  return {
    html: null,
    finalUrl: pageUrl,
    pageFetchMethod: null,
    status: http.status,
    error: rendered.error ?? http.error ?? "fetch failed",
    extractionStats: stats,
  };
}
