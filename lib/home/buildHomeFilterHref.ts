import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { normalizeSource } from "@/lib/article/normalizeSource";

export function buildHomeSourceFilterHref(
  locale: ArticleLocale,
  source: string
): string {
  const key = normalizeSource(source);
  return `/${locale}?source=${encodeURIComponent(key)}`;
}

export function buildHomeCategoryFilterHref(
  locale: ArticleLocale,
  category: string
): string {
  const key = (category || "other").trim().toLowerCase();
  return `/${locale}?category=${encodeURIComponent(key)}`;
}

export function parseHomeSourceFilter(
  value: string | null | undefined
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  return normalizeSource(raw);
}
