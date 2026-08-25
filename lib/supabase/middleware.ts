import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Edge middleware must not wait indefinitely on Auth (Vercel ~25s → 504). */
const AUTH_GET_USER_TIMEOUT_MS = 2500;

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (c) =>
        c.name.startsWith("sb-") ||
        c.name.includes("auth-token") ||
        c.name.includes("supabase")
    );
}

async function getUserWithTimeout(
  getUser: () => Promise<{ data: { user: unknown }; error: unknown }>
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getUser(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("supabase_auth_timeout"));
        }, AUTH_GET_USER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Refresh Supabase session cookies and return the current user.
 * Skips network when no auth cookie is present (common public→admin bounce).
 */
export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!hasSupabaseAuthCookie(request)) {
    return { response: supabaseResponse, user: null };
  }

  const { url, key } = getSupabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await getUserWithTimeout(() => supabase.auth.getUser());

  return {
    response: supabaseResponse,
    user: user as { email?: string | null } | null,
  };
}
