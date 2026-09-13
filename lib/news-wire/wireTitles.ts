/** URL helpers for public News Wire (no translation). */

export function trimTitle(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Display the original RSS title as-is (KO and EN pages share it). */
export function displayOriginalWireTitle(row: {
  rss_title: string;
}): string | null {
  const title = trimTitle(row.rss_title);
  return title || null;
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
