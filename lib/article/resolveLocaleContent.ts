/** Article row fields used to pick locale-appropriate public copy. */
export type ArticlesContentFields = {
  language_original?: string | null;
  title_original: string;
  title_ko?: string | null;
  title_translated?: string | null;
  summary_original?: string | null;
  summary_ko?: string | null;
  summary_translated?: string | null;
  body_original?: string | null;
  body_translated?: string | null;
};

export type LocalizationContentFields = {
  title: string;
  summary: string | null;
  body: string | null;
};

function trim(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickFirst(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    const next = trim(value);
    if (next) return next;
  }
  return "";
}

/** True when Hangul dominates over Latin letters (Korean reader-facing copy). */
export function isMostlyKorean(text: string): boolean {
  if (!text) return false;
  const hangul = (text.match(/[\u3131-\uD79D]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  return hangul > 0 && hangul >= latin;
}

/** Korean pages: translation columns first, then ko localization. */
export function resolveTitleForLocale(
  locale: "ko" | "en",
  article: ArticlesContentFields,
  localization: Pick<LocalizationContentFields, "title">
): string {
  if (locale === "ko") {
    return pickFirst(
      article.title_ko,
      article.title_translated,
      localization.title
    );
  }

  const englishFromArticle = trim(article.title_original);
  if (englishFromArticle && !isMostlyKorean(englishFromArticle)) {
    return englishFromArticle;
  }

  const locTitle = trim(localization.title);
  if (locTitle && !isMostlyKorean(locTitle)) return locTitle;

  return englishFromArticle;
}

export function resolveSummaryForLocale(
  locale: "ko" | "en",
  article: ArticlesContentFields,
  localization: Pick<LocalizationContentFields, "summary">
): string | null {
  if (locale === "ko") {
    const value = pickFirst(
      article.summary_ko,
      article.summary_translated,
      localization.summary
    );
    return value || null;
  }

  const englishFromArticle = trim(article.summary_original);
  if (englishFromArticle && !isMostlyKorean(englishFromArticle)) {
    return englishFromArticle;
  }

  const locSummary = trim(localization.summary);
  if (locSummary && !isMostlyKorean(locSummary)) return locSummary;

  return englishFromArticle || null;
}

export function resolveBodyForLocale(
  locale: "ko" | "en",
  article: ArticlesContentFields,
  localization: Pick<LocalizationContentFields, "body">
): string | null {
  if (locale === "ko") {
    const value = pickFirst(
      article.body_translated,
      localization.body
    );
    return value || null;
  }

  const englishFromArticle = trim(article.body_original);
  if (englishFromArticle && !isMostlyKorean(englishFromArticle)) {
    return englishFromArticle;
  }

  const locBody = trim(localization.body);
  if (locBody && !isMostlyKorean(locBody)) return locBody;

  return englishFromArticle || null;
}

/** Optional “original title” line on article detail (Korean edition only). */
export function resolveOriginalTitleForDisplay(
  locale: "ko" | "en",
  article: ArticlesContentFields,
  displayTitle: string
): string | null {
  if (locale === "en") return null;

  const original = trim(article.title_original);
  if (!original || original === displayTitle) return null;

  const lang = trim(article.language_original).toLowerCase();
  if (lang === "en" || !isMostlyKorean(original)) return original;

  return null;
}
