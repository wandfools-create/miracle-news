import { NextRequest, NextResponse } from "next/server";

import { runMorningBriefCron } from "@/lib/discord/runMorningBrief";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === secret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const result = await runMorningBriefCron({ dryRun });

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    skipped: result.skipped,
    dryRun: result.dryRun ?? false,
    recommend: result.recommend
      ? {
          ok: result.recommend.ok,
          updated: result.recommend.ok ? result.recommend.updated : null,
          openaiCalls: result.recommend.openaiCalls,
        }
      : null,
    errors: result.errors,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
