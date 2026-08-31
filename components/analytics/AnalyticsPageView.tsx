"use client";

import { useEffect, useRef } from "react";
import { createAnonymousSessionId } from "@/lib/analytics/types";
import type { AnalyticsEventName } from "@/lib/analytics/types";

const SESSION_KEY = "mn_analytics_session";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = createAnonymousSessionId();
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  payload?: Omit<Parameters<typeof sendEvent>[0], "eventName">
) {
  void sendEvent({ eventName, ...payload });
}

async function sendEvent(input: {
  eventName: AnalyticsEventName;
  locale?: string;
  path?: string;
  articleId?: string;
  sourceKey?: string;
  categoryKey?: string;
  searchQuery?: string;
}) {
  try {
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        sessionId: getSessionId(),
        referrerDomain: document.referrer || null,
        deviceClass: window.matchMedia("(max-width: 768px)").matches
          ? "mobile"
          : "desktop",
      }),
      keepalive: true,
    });
  } catch {
    // non-blocking
  }
}

export default function AnalyticsPageView({
  locale,
  path,
}: {
  locale: "ko" | "en";
  path: string;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void sendEvent({ eventName: "page_view", locale, path });
  }, [locale, path]);
  return null;
}
