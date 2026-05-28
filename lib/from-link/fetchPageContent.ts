import "server-only";

import { fetchHtmlDocument } from "./httpFetch";
import { extractArticleBodyFromHtml } from "./server/extractArticleBody";
import { fetchRenderedHtmlWithPlaywright } from "./server/fetchRenderedHtml";
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

function bodyProbe(html: string, pageUrl: string) {
  return extractArticleBodyFromHtml(html, pageUrl);
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
 * Fetch article HTML: plain HTTP first, then Playwright when fetch fails or body is insufficient.
 */
export async function fetchPageHtmlForExtraction(
  pageUrl: string
): Promise<PageHtmlForExtraction> {
  let stats = emptyExtractionStats();

  const http = await fetchHtmlDocument(pageUrl);

  if (http.html) {
    const probe = bodyProbe(http.html, http.finalUrl);
    stats = statsFromProbe(stats, "http", probe);

    if (probe.success) {
      console.log("[from-link/extract] HTTP fetch succeeded with usable body", {
        url: pageUrl,
        bodyLength: probe.body?.length ?? 0,
        extractMethod: probe.method,
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
        extractMethod: probe.method,
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
    const pwProbe = bodyProbe(rendered.html, rendered.finalUrl);
    stats = statsFromProbe(stats, "playwright", pwProbe);

    if (pwProbe.success) {
      console.log("[from-link/extract] Playwright succeeded with usable body", {
        url: pageUrl,
        bodyLength: pwProbe.body?.length ?? 0,
        extractMethod: pwProbe.method,
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
