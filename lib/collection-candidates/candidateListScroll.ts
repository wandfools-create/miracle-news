/** Shared scroll preserve for /admin/collection-candidates after status mutations. */

export const CC_SCROLL_STORAGE_KEY = "admin-cc-scroll-y";
export const CC_SCROLL_HASH_PREFIX = "ccy=";

export function readScrollYFromHash(hash: string): number | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith(CC_SCROLL_HASH_PREFIX)) return null;
  const n = Number.parseInt(raw.slice(CC_SCROLL_HASH_PREFIX.length), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function buildScrollHash(scrollY: number): string {
  const y = Math.max(0, Math.round(scrollY));
  return `${CC_SCROLL_HASH_PREFIX}${y}`;
}

export function parseScrollYFormValue(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
