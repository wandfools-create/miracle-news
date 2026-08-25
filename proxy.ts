import { NextResponse, type NextRequest } from "next/server";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Admin-only routing gate (Next.js 16 `proxy` = former `middleware`).
 * Public pages and /api/* (cron, discord, ingest) are excluded via matcher —
 * they never invoke this function.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Defense in depth if matcher is ever widened.
  if (
    !pathname.startsWith("/admin") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  const isLoginPage =
    pathname === "/admin/login" || pathname.startsWith("/admin/login/");

  try {
    const { response, user } = await updateSupabaseSession(request);
    const isAllowedAdmin = isAllowedAdminEmail(user?.email);

    if (!isLoginPage && !user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!isLoginPage && user && !isAllowedAdmin) {
      return NextResponse.redirect(new URL("/403", request.url));
    }

    if (isLoginPage && user && isAllowedAdmin) {
      const next = request.nextUrl.searchParams.get("next");
      const destination =
        next && next.startsWith("/admin") && !next.startsWith("/admin/login")
          ? next
          : "/admin";
      return NextResponse.redirect(new URL(destination, request.url));
    }

    if (isLoginPage && user && !isAllowedAdmin) {
      return response;
    }

    return response;
  } catch {
    // Auth timeout / Supabase outage: never hang the edge. Keep login usable.
    if (!isLoginPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }
}

export const config = {
  /*
   * Admin desk only. Does not match /, /ko, /en, /api/cron/*, /api/discord/*, etc.
   * Dual entries cover `/admin` and nested paths.
   */
  matcher: ["/admin", "/admin/:path*"],
};
