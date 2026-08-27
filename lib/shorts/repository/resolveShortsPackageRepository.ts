import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createFileShortsPackageRepository } from "@/lib/shorts/repository/fileShortsPackageRepository";
import { createSupabaseShortsPackageRepository } from "@/lib/shorts/repository/supabaseShortsPackageRepository";
import {
  resolveShortsPackageStoreMode,
  type ShortsPackageRepository,
  type ShortsPackageRepoResult,
} from "@/lib/shorts/repository/types";

export type ResolveShortsPackageRepositoryResult =
  ShortsPackageRepoResult<ShortsPackageRepository>;

/**
 * Resolve the active Shorts package repository.
 * Production never falls back to file store.
 */
export function resolveShortsPackageRepository(input?: {
  nodeEnv?: string;
  store?: string;
}): ResolveShortsPackageRepositoryResult {
  const mode = resolveShortsPackageStoreMode(input);
  if (!mode.ok) {
    return { ok: false, error: mode.error, step: mode.step };
  }

  if (mode.mode === "file") {
    return { ok: true, data: createFileShortsPackageRepository() };
  }

  try {
    const client = getSupabaseAdmin();
    return { ok: true, data: createSupabaseShortsPackageRepository(client) };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Supabase 클라이언트를 만들지 못했습니다.";
    // Avoid leaking raw env/secret payloads from thrown JSON.
    const safe =
      message.includes("env_check") || message.includes("dns_check")
        ? "Supabase 서비스 환경 설정을 확인하세요."
        : "Supabase 저장소에 연결하지 못했습니다.";
    return { ok: false, error: safe, step: "supabase_client" };
  }
}
