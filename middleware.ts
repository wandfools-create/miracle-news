import { NextResponse, type NextRequest } from "next/server";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
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
    if (!isLoginPage) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
