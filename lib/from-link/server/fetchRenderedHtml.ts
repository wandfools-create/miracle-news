import "server-only";

import { DEFAULT_FETCH_HEADERS } from "../htmlText";

const PLAYWRIGHT_NAV_TIMEOUT_MS = 28_000;
const PLAYWRIGHT_SETTLE_MS = 2_500;
const MAX_RENDERED_HTML_CHARS = 800_000;

export type PlaywrightHtmlResult = {
  html: string | null;
  finalUrl: string;
  error: string | null;
};

function isPlaywrightDisabled(): boolean {
  return process.env.FROM_LINK_PLAYWRIGHT?.trim() === "0";
}

export async function fetchRenderedHtmlWithPlaywright(
  pageUrl: string
): Promise<PlaywrightHtmlResult> {
  if (isPlaywrightDisabled()) {
    return {
      html: null,
      finalUrl: pageUrl,
      error: "Playwright disabled (FROM_LINK_PLAYWRIGHT=0)",
    };
  }

  try {
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const context = await browser.newContext({
        userAgent: DEFAULT_FETCH_HEADERS["User-Agent"],
        locale: "en-US",
        extraHTTPHeaders: {
          "Accept-Language": DEFAULT_FETCH_HEADERS["Accept-Language"],
        },
        viewport: { width: 1280, height: 900 },
      });

      const page = await context.newPage();

      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (type === "image" || type === "media" || type === "font") {
          void route.abort();
          return;
        }
        void route.continue();
      });

      const response = await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: PLAYWRIGHT_NAV_TIMEOUT_MS,
      });

      if (!response) {
        await context.close();
        return {
          html: null,
          finalUrl: pageUrl,
          error: "Playwright navigation returned no response",
        };
      }

      await Promise.race([
        page
          .waitForSelector("article p, main p, [role='main'] p", {
            timeout: 6_000,
          })
          .catch(() => null),
        page.waitForTimeout(PLAYWRIGHT_SETTLE_MS),
      ]);

      let html = await page.content();
      const finalUrl = page.url() || pageUrl;

      await context.close();

      if (html.length > MAX_RENDERED_HTML_CHARS) {
        html = html.slice(0, MAX_RENDERED_HTML_CHARS);
      }

      console.log("[from-link/extract] Playwright rendered page", {
        url: pageUrl,
        finalUrl,
        htmlLength: html.length,
        status: response.status(),
      });

      return { html, finalUrl, error: null };
    } finally {
      await browser.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = message.includes("Executable doesn't exist")
      ? " Run: npx playwright install chromium"
      : "";
    console.warn("[from-link/extract] Playwright failed", {
      url: pageUrl,
      error: message,
    });
    return {
      html: null,
      finalUrl: pageUrl,
      error: `${message}${hint}`,
    };
  }
}
