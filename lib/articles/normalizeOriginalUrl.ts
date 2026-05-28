/** Canonical form for comparing original_url values. */
export function normalizeOriginalUrl(urlStr: string): string {
  const trimmed = urlStr.trim();
  if (!trimmed) return trimmed;

  try {
    const u = new URL(trimmed);
    u.hash = "";
    let href = u.href;
    if (href.endsWith("/") && u.pathname.length > 1) {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return trimmed;
  }
}
