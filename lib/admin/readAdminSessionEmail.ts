import "server-only";

import { cookies } from "next/headers";

type JwtPayload = {
  email?: string;
  exp?: number;
};

/** Decode Supabase access_token JWT payload without a network round-trip. */
function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.trim().split(".");
  if (parts.length < 2) return null;
  let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (payload.length % 4 !== 0) payload += "=";
  try {
    const json = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8")
    ) as JwtPayload;
    return json;
  } catch {
    return null;
  }
}

function extractAccessToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        access_token?: string;
        currentSession?: { access_token?: string };
      };
      return (
        parsed.access_token?.trim() ||
        parsed.currentSession?.access_token?.trim() ||
        null
      );
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith("eyJ")) return trimmed;
  return null;
}

/**
 * Display-only admin email from session cookies.
 * Auth enforcement remains in proxy.ts (network getUser).
 * Does NOT grant access — returns null when cookie missing/expired.
 */
export async function readAdminSessionEmailFromCookies(): Promise<
  string | null
> {
  const cookieStore = await cookies();
  const authCookie = cookieStore
    .getAll()
    .find(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("auth-token") &&
        c.value?.trim()
    );

  if (!authCookie?.value) return null;

  const token = extractAccessToken(authCookie.value);
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload?.email?.trim()) return null;

  if (typeof payload.exp === "number") {
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp <= nowSec) return null;
  }

  return payload.email.trim();
}
