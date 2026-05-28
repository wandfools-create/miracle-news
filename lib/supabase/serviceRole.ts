import "server-only";
import { lookup } from "node:dns/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseEnvCheck =
  | {
      ok: true;
      url: string;
      urlHost: string;
      keyPrefix: string;
    }
  | {
      ok: false;
      step: "env_check" | "dns_check";
      error: string;
      hint: string;
      missingVars: string[];
    };

export type SupabaseOperationFailure = {
  step: string;
  error: string;
  code?: string;
  hint?: string;
  details?: string;
};

function maskKey(key: string): string {
  if (key.length <= 12) return "(too short)";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** Hostname `abcdefgh.supabase.co` → project ref `abcdefgh`. */
export function parseProjectRefFromHost(host: string): string | null {
  const m = host.trim().toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/);
  return m?.[1] ?? null;
}

/** JWT service_role payload `ref` (does not expose the secret). */
export function parseProjectRefFromServiceRoleJwt(key: string): string | null {
  const parts = key.trim().split(".");
  if (parts.length < 2 || !parts[0].startsWith("eyJ")) return null;
  let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (payload.length % 4 !== 0) payload += "=";
  try {
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      ref?: string;
    };
    return typeof json.ref === "string" && json.ref.trim() ? json.ref.trim() : null;
  } catch {
    return null;
  }
}

export async function verifySupabaseHostDns(
  host: string
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  try {
    await lookup(host);
    return { ok: true };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as NodeJS.ErrnoException).code)
        : "UNKNOWN";
    const message =
      err instanceof Error ? err.message : "DNS lookup failed";
    return { ok: false, code, message };
  }
}

export function checkSupabaseServiceEnv(): SupabaseEnvCheck {
  const urlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missingVars: string[] = [];

  if (!urlRaw?.trim()) missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!keyRaw?.trim()) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missingVars.length > 0) {
    return {
      ok: false,
      step: "env_check",
      error: `Supabase 환경 변수가 없습니다: ${missingVars.join(", ")}`,
      hint:
        ".env.local에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 넣고 `npm run dev`를 재시작하세요. (서버 액션은 .env.local을 읽습니다.)",
      missingVars,
    };
  }

  const url = urlRaw!.trim();
  const key = keyRaw!.trim();

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        ok: false,
        step: "env_check",
        error: `NEXT_PUBLIC_SUPABASE_URL 프로토콜이 올바르지 않습니다: ${parsed.protocol}`,
        hint: "https://YOUR_PROJECT.supabase.co 형식인지 확인하세요.",
        missingVars: [],
      };
    }
  } catch {
    return {
      ok: false,
      step: "env_check",
      error: "NEXT_PUBLIC_SUPABASE_URL이 유효한 URL이 아닙니다.",
      hint: "https://YOUR_PROJECT.supabase.co 형식인지 확인하세요.",
      missingVars: [],
    };
  }

  if (!key.startsWith("eyJ") && !key.startsWith("sb_")) {
    return {
      ok: false,
      step: "env_check",
      error:
        "SUPABASE_SERVICE_ROLE_KEY 형식이 예상과 다릵니다 (JWT eyJ… 또는 sb_…).",
      hint:
        "Supabase 대시보드 → Project Settings → API → service_role (secret) 키를 사용하세요. publishable/anon 키가 아닙니다.",
      missingVars: [],
    };
  }

  const urlHost = new URL(url).host;
  const urlRef = parseProjectRefFromHost(urlHost);
  const jwtRef = parseProjectRefFromServiceRoleJwt(key);

  if (!urlRef) {
    return {
      ok: false,
      step: "env_check",
      error: `NEXT_PUBLIC_SUPABASE_URL 호스트가 Supabase 형식이 아닙니다: ${urlHost}`,
      hint: "https://<project-ref>.supabase.co (경로·슬래시 없음) 인지 확인하세요.",
      missingVars: [],
    };
  }

  if (jwtRef && urlRef !== jwtRef) {
    return {
      ok: false,
      step: "env_check",
      error: `URL 프로젝트 ref(${urlRef})와 service_role JWT ref(${jwtRef})가 다릅니다.`,
      hint:
        "대시보드 → Project Settings → API에서 Project URL과 service_role 키를 같은 프로젝트에서 다시 복사해 .env.local에 넣으세요.",
      missingVars: [],
    };
  }

  return {
    ok: true,
    url,
    urlHost,
    keyPrefix: maskKey(key),
  };
}

/** Sync env + DNS lookup (ENOTFOUND 방지). */
export async function checkSupabaseServiceEnvWithDns(): Promise<SupabaseEnvCheck> {
  const base = checkSupabaseServiceEnv();
  if (!base.ok) return base;

  const dns = await verifySupabaseHostDns(base.urlHost);
  if (!dns.ok) {
    const urlRef = parseProjectRefFromHost(base.urlHost);
    const jwtRef = parseProjectRefFromServiceRoleJwt(
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
    );
    console.error("[supabase/serviceRole] dns_check failed", {
      host: base.urlHost,
      dnsCode: dns.code,
      dnsMessage: dns.message,
      urlRef,
      jwtRef,
    });
    return {
      ok: false,
      step: "dns_check",
      error: `Supabase 호스트 DNS 조회 실패 (${dns.code}): ${base.urlHost}`,
      hint:
        `이 호스트는 인터넷 DNS에 존재하지 않습니다(NXDOMAIN/ENOTFOUND). Supabase 대시보드 → Project Settings → API의 **Project URL**을 그대로 복사해 NEXT_PUBLIC_SUPABASE_URL에 넣으세요. ` +
        `현재 URL ref: ${urlRef ?? "?"} · JWT ref: ${jwtRef ?? "?"}. 프로젝트가 삭제·일시중지되었거나 ref 오타일 수 있습니다.`,
      missingVars: [],
    };
  }

  return base;
}

function extractCauseMessage(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const c = cause as { code?: string; message?: string; errno?: number };
  const parts: string[] = [];
  if (c.code) parts.push(`code=${c.code}`);
  if (c.errno !== undefined) parts.push(`errno=${c.errno}`);
  if (c.message) parts.push(c.message);
  return parts.length ? parts.join(", ") : null;
}

export function formatSupabaseThrownError(
  step: string,
  err: unknown,
  envHost?: string
): SupabaseOperationFailure {
  const e = err instanceof Error ? err : new Error(String(err));
  const causeMsg = extractCauseMessage(e.cause);
  let hint: string | undefined;
  let details = causeMsg ? `${e.message} | ${causeMsg}` : e.message;

  const isFetchFailed =
    e.message.includes("fetch failed") ||
    details.includes("fetch failed") ||
    details.includes("ENOTFOUND") ||
    details.includes("NXDOMAIN") ||
    e.name === "TypeError";

  if (isFetchFailed) {
    hint =
      "Supabase REST API에 연결하지 못했습니다. " +
      (envHost ? `호스트(${envHost}) ` : "") +
      "ENOTFOUND면 NEXT_PUBLIC_SUPABASE_URL의 project-ref가 잘못되었거나 프로젝트가 없습니다. " +
      "대시보드 → Project Settings → API의 Project URL을 다시 복사하고 `npm run dev`를 재시작하세요.";
    details = `네트워크(fetch): ${details}`;
  }

  console.error(`[supabase/serviceRole] ${step} threw`, {
    name: e.name,
    message: e.message,
    cause: e.cause,
    stack: e.stack,
  });

  return {
    step,
    error: e.message || "unknown error",
    code: e.name,
    hint,
    details,
  };
}

export function formatPostgrestError(
  step: string,
  pg: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  }
): SupabaseOperationFailure {
  const message = pg.message || "database error";
  console.error(`[supabase/serviceRole] ${step} postgrest`, pg);
  return {
    step,
    error: message,
    code: pg.code,
    hint: pg.hint || pg.details,
    details: pg.details,
  };
}

export function createServiceRoleSupabaseClient(): {
  client: SupabaseClient;
  env: Extract<SupabaseEnvCheck, { ok: true }>;
} {
  const env = checkSupabaseServiceEnv();
  if (!env.ok) {
    throw new Error(
      JSON.stringify({
        step: env.step,
        error: env.error,
        hint: env.hint,
      })
    );
  }

  const client = createClient(env.url, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return { client, env };
}
