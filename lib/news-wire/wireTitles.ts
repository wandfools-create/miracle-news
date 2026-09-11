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

export function isWireTitlesReady(row: {
  rss_title: string;
  rss_title_ko?: string | null;
  rss_title_en?: string | null;
  wire_titles_ready_at?: string | null;
}): boolean {
  if (row.wire_titles_ready_at) return true;
  return isWireKoTitleReady(row) && isWireEnTitleReady(row);
}

export function displayWireTitle(
  row: {
    rss_title: string;
    rss_title_ko?: string | null;
    rss_title_en?: string | null;
  },
  locale: "ko" | "en"
): string {
  if (locale === "ko") {
    return (
      trimTitle(row.rss_title_ko) ||
      (titleHasHangul(row.rss_title) ? trimTitle(row.rss_title) : "") ||
      trimTitle(row.rss_title)
    );
  }
  return (
    trimTitle(row.rss_title_en) ||
    (!titleHasHangul(row.rss_title) ? trimTitle(row.rss_title) : "") ||
    trimTitle(row.rss_title_en) ||
    trimTitle(row.rss_title)
  );
}

/** Allow only http(s) absolute URLs for public outbound links. */
export function sanitizeWireOutboundUrl(raw: string | null | undefined): string | null {
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
