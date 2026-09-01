"use client";

import { useEffect, useRef } from "react";
import { trackAnalyticsEvent } from "./AnalyticsPageView";
import type { AnalyticsLocale } from "@/lib/analytics/types";

export function AnalyticsSearchSubmit({
  locale,
  query,
}: {
  locale: AnalyticsLocale;
  query: string;
}) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || sent.current === trimmed) return;
    sent.current = trimmed;
    trackAnalyticsEvent({
      eventName: "search_submit",
      locale,
      searchQuery: trimmed,
    });
  }, [locale, query]);
  return null;
}
