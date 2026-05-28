export type ResolvedSubmittedUrl =
  | { ok: true; href: string }
  | { ok: false; error: string };

/**
 * Parse user-entered URL for storage as original_url.
 * Only adds https:// when missing; does not rewrite host/path to another article.
 */
export function resolveSubmittedUrl(urlRaw: string): ResolvedSubmittedUrl {
  const trimmed = urlRaw.trim();
  if (!trimmed) {
    return { ok: false, error: "URL을 입력해 주세요." };
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "http(s) URL만 지원합니다." };
    }
    if (!url.hostname) {
      return { ok: false, error: "URL 형식이 올바르지 않습니다." };
    }
    return { ok: true, href: url.href };
  } catch {
    return { ok: false, error: "URL 형식이 올바르지 않습니다." };
  }
}

export function isValidOriginalUrl(urlStr: string): boolean {
  return resolveSubmittedUrl(urlStr).ok;
}
