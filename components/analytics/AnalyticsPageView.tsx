"use client";

import { useEffect, useRef } from "react";
import {
  parseStoredAnonymousSession,
  resolveAnonymousSession,
  shouldStoreReferrerForEvent,
  type AnalyticsEventName,
  type AnalyticsLocale,
} from "@/lib/analytics/types";

const SESSION_KEY = "mn_analytics_session";

function readStoredSession(): ReturnType<typeof parseStoredAnonymousSession> {
  if (typeof window === "undefined") return null;
  return parseStoredAnonymousSession(window.localStorage.getItem(SESSION_KEY));
}

function writeStoredSession(id: string, createdAt: number) {
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id, createdAt })
  );
}

export function getAnonymousSessionId(): string {
  if (typeof window === "undefined") return "";
  const now = Date.now();
  const resolved = resolveAnonymousSession(readStoredSession(), now);
  writeStoredSession(resolved.id, resolved.createdAt);
  return resolved.id;
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
        sessionId: getAnonymousSessionId(),
        path: input.path ?? window.location.pathname,
        referrerDomain: shouldStoreReferrerForEvent(input.eventName)
          ? document.referrer || null
          : null,
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
