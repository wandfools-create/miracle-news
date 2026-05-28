import type { ArticleLocale } from "./formatPublishedDate";

const labels: Record<ArticleLocale, Record<string, string>> = {
  ko: {
    politics: "정치",
    economy: "경제",
    society: "사회",
    world: "국제",
    religion: "종교",
    other: "기타",
  },
  en: {
    politics: "Politics",
    economy: "Economy",
    society: "Society",
    world: "World",
    religion: "Religion",
    other: "Other",
  },
};

const uncategorized: Record<ArticleLocale, string> = {
  ko: "미분류",
  en: "Uncategorized",
};

export function getCategoryLabel(
  value: string | null,
  locale: ArticleLocale
): string {
  if (!value) return uncategorized[locale];
  return labels[locale][value] ?? value;
}
