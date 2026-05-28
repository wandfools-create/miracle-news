import "server-only";

import { DEFAULT_FETCH_HEADERS } from "./htmlText";

const FETCH_TIMEOUT_MS = 18_000;
const MAX_HTML_BYTES = 800_000;

export async function fetchHtmlDocument(pageUrl: string): Promise<{
  html: string | null;
  finalUrl: string;
  status: number | null;
  error: string | null;
}> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: DEFAULT_FETCH_HEADERS,
    });
    if (!res.ok) {
      return {
        html: null,
        finalUrl: pageUrl,
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }
    const buf = await res.arrayBuffer();
    const slice =
      buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    return {
      html,
      finalUrl: res.url?.trim() || pageUrl,
      status: res.status,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "fetch failed";
    return { html: null, finalUrl: pageUrl, status: null, error: message };
  } finally {
    clearTimeout(id);
  }
}
