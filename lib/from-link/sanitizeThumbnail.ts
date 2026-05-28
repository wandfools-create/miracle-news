/** Keep only usable absolute image URLs; otherwise null (UI shows “no image”). */
export function sanitizeThumbnailUrl(
  value: string | null | undefined
): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}
