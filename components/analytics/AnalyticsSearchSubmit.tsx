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
  const sentQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (sentQueryRef.current === trimmed) return;
    sentQueryRef.current = trimmed;
    trackAnalyticsEvent({
      eventName: "search_submit",
      locale,
      searchQuery: trimmed,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
  }, [locale, query]);

  return null;
}
