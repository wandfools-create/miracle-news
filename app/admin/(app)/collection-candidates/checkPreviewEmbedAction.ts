"use server";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PreviewFrameCheckResult = {
  allowed: boolean;
  reason?: "xfo" | "csp" | "fetch_failed" | "auth";
};

/**
 * Best-effort check whether a URL may be embedded in an iframe.
 * No OpenAI. Network HEAD/GET of the original URL only.
 */
export async function checkOriginalPreviewEmbeddable(
  url: string
): Promise<PreviewFrameCheckResult> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) {
    return { allowed: false, reason: "auth" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "fetch_failed" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "fetch_failed" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "HannoonNewsBot/1.0 (+https://hannoon.news; preview-check)",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
      });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(parsed.toString(), {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent":
              "HannoonNewsBot/1.0 (+https://hannoon.news; preview-check)",
            Accept: "text/html,application/xhtml+xml,*/*",
            Range: "bytes=0-0",
          },
        });
      }
    } finally {
      clearTimeout(timer);
    }

    const xfo = res.headers.get("x-frame-options")?.toLowerCase() ?? "";
    if (xfo.includes("deny") || xfo.includes("sameorigin")) {
      return { allowed: false, reason: "xfo" };
    }

    const csp = res.headers.get("content-security-policy") ?? "";
    const frameAncestors = csp.match(/frame-ancestors\s+([^;]+)/i)?.[1]?.trim();
    if (frameAncestors) {
      const fa = frameAncestors.toLowerCase();
      if (fa === "'none'" || fa === "none") {
        return { allowed: false, reason: "csp" };
      }
      if (
        !fa.includes("*") &&
        !fa.includes("'self'") &&
        !fa.includes("hannoon")
      ) {
        return { allowed: false, reason: "csp" };
      }
    }

    return { allowed: true };
  } catch {
    // Unknown — try iframe; UI still offers new-tab fallback.
    return { allowed: true };
  }
}
