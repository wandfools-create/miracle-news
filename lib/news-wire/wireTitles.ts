/** Title readiness + display helpers for public News Wire (no OpenAI). */

const HANGUL_RE = /[\uac00-\ud7a3]/u;

export function titleHasHangul(title: string | null | undefined): boolean {
  return HANGUL_RE.test((title ?? "").trim());
}

export function trimTitle(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** KO display title ready: stored KO title or native Hangul RSS title. */
export function isWireKoTitleReady(row: {
  rss_title: string;
  rss_title_ko?: string | null;
}): boolean {
  if (trimTitle(row.rss_title_ko)) return true;
  return titleHasHangul(row.rss_title);
}

/** EN display title ready: stored EN title or native non-Hangul RSS title. */
export function isWireEnTitleReady(row: {
  rss_title: string;
  rss_title_en?: string | null;
}): boolean {
  if (trimTitle(row.rss_title_en)) return true;
  const raw = trimTitle(row.rss_title);
  return Boolean(raw) && !titleHasHangul(raw);
}

/**
 * Both locales must actually be ready.
 * Never trust wire_titles_ready_at alone (stale/wrong timestamps).
 */
export function isWireTitlesReady(row: {
  rss_title: string;
  rss_title_ko?: string | null;
  rss_title_en?: string | null;
  wire_titles_ready_at?: string | null;
}): boolean {
  return isWireKoTitleReady(row) && isWireEnTitleReady(row);
}

/**
 * Locale title for public display.
 * Returns null instead of falling back to the opposite language.
 */
export function displayWireTitle(
  row: {
    rss_title: string;
    rss_title_ko?: string | null;
    rss_title_en?: string | null;
  },
  locale: "ko" | "en"
): string | null {
  if (locale === "ko") {
    if (trimTitle(row.rss_title_ko)) return trimTitle(row.rss_title_ko);
    if (titleHasHangul(row.rss_title)) return trimTitle(row.rss_title);
    return null;
  }
  if (trimTitle(row.rss_title_en)) return trimTitle(row.rss_title_en);
  if (!titleHasHangul(row.rss_title) && trimTitle(row.rss_title)) {
    return trimTitle(row.rss_title);
  }
  return null;
}

/** Allow only http(s) absolute URLs for public outbound links. */
export function sanitizeWireOutboundUrl(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
