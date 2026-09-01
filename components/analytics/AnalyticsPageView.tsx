"use client";

import { useEffect, useRef } from "react";
import {
  createAnonymousSessionId,
  type AnalyticsEventName,
  type AnalyticsLocale,
} from "@/lib/analytics/types";

const SESSION_KEY = "mn_analytics_session";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = createAnonymousSessionId();
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

function resolveDeviceClass(): "mobile" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia("(max-width: 768px)").matches ? "mobile" : "desktop";
}

function shouldSkipPublicTracking(): boolean {
  if (typeof window === "undefined") return true;
  return window.location.pathname.startsWith("/admin");
}

export type TrackAnalyticsInput = {
  eventName: AnalyticsEventName;
  locale?: AnalyticsLocale;
  path?: string;
  articleId?: string;
  sourceKey?: string;
  categoryKey?: string;
  searchQuery?: string;
};

export function trackAnalyticsEvent(input: TrackAnalyticsInput) {
  if (shouldSkipPublicTracking()) return;
  void sendEvent(input);
}

async function sendEvent(input: TrackAnalyticsInput) {
  try {
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        sessionId: getSessionId(),
        path: input.path ?? window.location.pathname,
        referrerDomain: document.referrer || null,
        deviceClass: resolveDeviceClass(),
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
  locale: AnalyticsLocale;
  path: string;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || shouldSkipPublicTracking()) return;
    sent.current = true;
    void sendEvent({ eventName: "page_view", locale, path });
  }, [locale, path]);
  return null;
}
