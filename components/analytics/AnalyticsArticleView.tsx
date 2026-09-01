"use client";

import { useEffect, useRef } from "react";
import AnalyticsPageView, { trackAnalyticsEvent } from "./AnalyticsPageView";
import type { AnalyticsLocale } from "@/lib/analytics/types";

export function AnalyticsArticleView({
  articleId,
  locale,
  path,
}: {
  articleId: string;
  locale: AnalyticsLocale;
  path: string;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackAnalyticsEvent({
      eventName: "article_view",
      locale,
      path,
      articleId,
    });
  }, [articleId, locale, path]);

  return <AnalyticsPageView locale={locale} path={path} />;
}
