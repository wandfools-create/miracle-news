import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";
import type {
  ShortsGenerationMode,
  ShortsPackageStatus,
  ShortsProductionPackageContent,
  ShortsProductionPackageRecord,
} from "@/lib/shorts/shortsPackageTypes";

export type ShortsPackageRepoFailure = {
  ok: false;
  error: string;
  step: string;
};

export type ShortsPackageRepoSuccess<T> = {
  ok: true;
  data: T;
};

export type ShortsPackageRepoResult<T> =
  | ShortsPackageRepoSuccess<T>
  | ShortsPackageRepoFailure;

export type CreateShortsPackageInput = {
  desk: ShortsDesk;
  editDate: string;
  articleIds: string[];
  package: ShortsProductionPackageContent;
  generationMode: ShortsGenerationMode;
  createdBy: string | null;
};

export type ShortsPackageRepository = {
  create(
    input: CreateShortsPackageInput
  ): Promise<ShortsPackageRepoResult<ShortsProductionPackageRecord>>;
  getById(
    id: string
  ): Promise<ShortsPackageRepoResult<ShortsProductionPackageRecord | null>>;
  listRecent(
    limit?: number
  ): Promise<ShortsPackageRepoResult<ShortsProductionPackageRecord[]>>;
  updateDraft(
    id: string,
    packageContent: ShortsProductionPackageContent
  ): Promise<ShortsPackageRepoResult<ShortsProductionPackageRecord>>;
  markReviewed(
    id: string,
    packageContent: ShortsProductionPackageContent
  ): Promise<ShortsPackageRepoResult<ShortsProductionPackageRecord>>;
  revertToDraft(
    id: string
  ): Promise<ShortsPackageRepoResult<ShortsProductionPackageRecord>>;
};

export type ShortsPackageStoreMode = "file" | "supabase";

export const SHORTS_PRODUCTION_STORE_REQUIRED_MESSAGE =
  "Shorts Production 저장소 설정이 필요합니다. SHORTS_PACKAGE_STORE=supabase 로 설정하세요.";

export function isNodeEnvProduction(
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  return nodeEnv === "production";
}

/**
 * Resolve Shorts package store mode.
 * Production (NODE_ENV=production): supabase only — never silent file fallback.
 * Local/test: file (default) or supabase.
 */
export function resolveShortsPackageStoreMode(input?: {
  nodeEnv?: string;
  store?: string | undefined;
}):
  | { ok: true; mode: ShortsPackageStoreMode }
  | { ok: false; error: string; step: "store_config" } {
  const nodeEnv = input?.nodeEnv ?? process.env.NODE_ENV;
  const raw =
    input?.store !== undefined
      ? input.store
      : process.env.SHORTS_PACKAGE_STORE;
  const value = raw?.trim().toLowerCase() || "";
  const production = isNodeEnvProduction(nodeEnv);

  if (production) {
    if (value === "supabase") {
      return { ok: true, mode: "supabase" };
    }
    return {
      ok: false,
      error: SHORTS_PRODUCTION_STORE_REQUIRED_MESSAGE,
      step: "store_config",
    };
  }

  if (!value || value === "file") {
    return { ok: true, mode: "file" };
  }
  if (value === "supabase") {
    return { ok: true, mode: "supabase" };
  }

  return {
    ok: false,
    error: `SHORTS_PACKAGE_STORE 값이 올바르지 않습니다: ${value}. 허용값: file, supabase`,
    step: "store_config",
  };
}

export function assertDraftEditable(
  status: ShortsPackageStatus
): ShortsPackageRepoResult<true> {
  if (status === "reviewed") {
    return {
      ok: false,
      error:
        "검토 완료 상태에서는 수정할 수 없습니다. 먼저 「초안으로 되돌리기」를 실행하세요.",
      step: "reviewed_readonly",
    };
  }
  return { ok: true, data: true };
}
