"use client";

import { useEffect } from "react";
import { trackAnalyticsEvent } from "./AnalyticsPageView";
import type { AnalyticsLocale } from "@/lib/analytics/types";
import { normalizeSearchQueryForDisplay } from "@/lib/analytics/types";

function searchSubmitStorageKey(locale: AnalyticsLocale, query: string): string {
  return `mn_search_submit:${locale}:${normalizeSearchQueryForDisplay(query)}`;
}

function hasRecordedSearchSubmit(locale: AnalyticsLocale, query: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(searchSubmitStorageKey(locale, query)) === "1";
}

function markSearchSubmitRecorded(locale: AnalyticsLocale, query: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(searchSubmitStorageKey(locale, query), "1");
}

export function AnalyticsSearchSubmit({
  locale,
  query,
}: {
  locale: AnalyticsLocale;
  query: string;
}) {
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (hasRecordedSearchSubmit(locale, trimmed)) return;
    markSearchSubmitRecorded(locale, trimmed);
    trackAnalyticsEvent({
      eventName: "search_submit",
      locale,
      searchQuery: trimmed,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [locale, query]);
  return null;
}

export {
  hasRecordedSearchSubmit,
  markSearchSubmitRecorded,
  searchSubmitStorageKey,
};
