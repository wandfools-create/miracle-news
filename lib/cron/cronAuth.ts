import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === secret) return true;

  return false;
}

export function cronSecretMissingResponse() {
  return NextResponse.json(
    { ok: false, error: "CRON_SECRET is not configured" },
    { status: 500 }
  );
}

export function cronUnauthorizedResponse() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
