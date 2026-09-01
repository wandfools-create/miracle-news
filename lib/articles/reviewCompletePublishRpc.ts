/**
 * Types + RPC port for atomic review-complete-and-publish.
 * No server-only — injectable for unit tests.
 */

export type ReviewCompleteLocalizationPayload = {
  title: string;
  summary: string | null;
  body: string | null;
  slug: string;
  meta_description: string | null;
};

export type ReviewCompletePublishRpcInput = {
  articleId: string;
  approvedBy: string;
  ko: ReviewCompleteLocalizationPayload;
  en: ReviewCompleteLocalizationPayload;
};

export type ReviewCompletePublishRpcOk = {
  ok: true;
  published_at: string;
  first_publish: boolean;
};

export type ReviewCompletePublishRpcErr = {
  ok: false;
  step: string;
  error: string;
};

export type ReviewCompletePublishRpcResult =
  | ReviewCompletePublishRpcOk
  | ReviewCompletePublishRpcErr;

/** Outcome of attempting to invoke the RPC (transport vs function body). */
export type ReviewCompletePublishRpcCallOutcome =
  | { kind: "result"; result: ReviewCompletePublishRpcResult }
  | { kind: "missing_function" }
  | { kind: "transport_error"; message: string; code?: string };

export type ReviewCompletePublishRpcPort = {
  call(
    input: ReviewCompletePublishRpcInput
  ): Promise<ReviewCompletePublishRpcCallOutcome>;
};

const MISSING_RPC_CODES = new Set([
  "PGRST202", // PostgREST: function not found in schema cache
  "42883", // undefined_function
]);

export function isReviewCompletePublishRpcMissing(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}): boolean {
  const code = (error.code ?? "").trim();
  if (MISSING_RPC_CODES.has(code)) return true;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    blob.includes("review_complete_and_publish_article") &&
    (blob.includes("could not find") ||
      blob.includes("does not exist") ||
      blob.includes("not find the function") ||
      blob.includes("schema cache"))
  );
}

export const REVIEW_COMPLETE_PUBLISH_NOT_READY_ERROR =
  "공개 기능 준비 중 — 원자적 공개 RPC가 아직 적용되지 않았습니다. 관리자에게 migration 적용을 요청하세요.";

export function parseReviewCompletePublishRpcPayload(
  data: unknown
): ReviewCompletePublishRpcResult | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.ok === true) {
    const publishedAt =
      typeof row.published_at === "string" && row.published_at.trim()
        ? row.published_at
        : null;
    if (!publishedAt) return null;
    return {
      ok: true,
      published_at: publishedAt,
      first_publish: row.first_publish === true,
    };
  }
  if (row.ok === false) {
    return {
      ok: false,
      step: typeof row.step === "string" ? row.step : "rpc",
      error: typeof row.error === "string" ? row.error : "rpc_failed",
    };
  }
  return null;
}

type RpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{
    data: unknown;
    error: {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    } | null;
  }>;
};

/** Service-role Supabase client → RPC port (no silent fallback). */
export function createSupabaseReviewCompletePublishRpc(
  client: RpcClient
): ReviewCompletePublishRpcPort {
  return {
    async call(input) {
      const { data, error } = await client.rpc(
        "review_complete_and_publish_article",
        {
          p_article_id: input.articleId,
          p_approved_by: input.approvedBy,
          p_ko: input.ko,
          p_en: input.en,
        }
      );

      if (error) {
        if (isReviewCompletePublishRpcMissing(error)) {
          return { kind: "missing_function" };
        }
        return {
          kind: "transport_error",
          message: error.message || "rpc_transport_error",
          code: error.code,
        };
      }

      const parsed = parseReviewCompletePublishRpcPayload(data);
      if (!parsed) {
        return {
          kind: "transport_error",
          message: "unexpected_rpc_payload",
        };
      }
      return { kind: "result", result: parsed };
    },
  };
}
