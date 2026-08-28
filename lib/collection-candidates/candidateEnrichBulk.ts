import type { PromoteCollectionCandidateResult } from "@/lib/collection-candidates/promoteCollectionCandidate";

export type CandidateEnrichOutcome =
  | "success"
  | "already_enriched"
  | "same_event_blocked"
  | "status_blocked"
  | "enrich_failed"
  | "unexpected_error";

export type EnrichSingleCandidateItemResult = {
  candidateId: string;
  candidateTitle: string;
  ok: boolean;
  outcome: CandidateEnrichOutcome;
  articleId?: string;
  step?: string;
  safeMessage?: string;
  sameEventArticleId?: string;
  sameEventTitle?: string;
};

export type BulkCandidateEnrichSummary = {
  total: number;
  success: number;
  alreadyEnriched: number;
  sameEventBlocked: number;
  statusBlocked: number;
  enrichFailed: number;
  unexpectedError: number;
  results: EnrichSingleCandidateItemResult[];
};

const MAX_SAFE_MESSAGE_CHARS = 120;

export function sanitizeEnrichSafeMessage(
  error: string | undefined,
  step: string | undefined
): string {
  const lower = (error ?? "").toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("service_role") ||
    lower.includes("apikey") ||
    lower.includes("stack") ||
    lower.includes("openai")
  ) {
    return "서버 처리 오류";
  }
  if (step === "fetch_candidate" || step === "claim_candidate") {
    return "후보를 불러오거나 처리할 수 없습니다.";
  }
  if (step === "same_event_published") {
    return "이미 유사한 공개 기사가 있습니다.";
  }
  if (step === "status_guard") {
    return "제외되었거나 만료된 후보입니다.";
  }
  return (error ?? "기사 만들기에 실패했습니다.").slice(0, MAX_SAFE_MESSAGE_CHARS);
}

export function mapPromoteToEnrichItemResult(input: {
  candidateId: string;
  candidateTitle: string;
  promote: PromoteCollectionCandidateResult;
}): EnrichSingleCandidateItemResult {
  const { candidateId, candidateTitle, promote } = input;

  if (promote.ok) {
    return {
      candidateId,
      candidateTitle,
      ok: true,
      outcome: promote.alreadyEnriched ? "already_enriched" : "success",
      articleId: promote.articleId,
    };
  }

  if (promote.step === "same_event_published") {
    return {
      candidateId,
      candidateTitle,
      ok: false,
      outcome: "same_event_blocked",
      step: promote.step,
      safeMessage: sanitizeEnrichSafeMessage(promote.error, promote.step),
      sameEventArticleId: promote.sameEventArticleId,
      sameEventTitle: promote.sameEventTitle,
    };
  }

  if (promote.step === "status_guard") {
    return {
      candidateId,
      candidateTitle,
      ok: false,
      outcome: "status_blocked",
      step: promote.step,
      safeMessage: sanitizeEnrichSafeMessage(promote.error, promote.step),
    };
  }

  return {
    candidateId,
    candidateTitle,
    ok: false,
    outcome: "enrich_failed",
    step: promote.step,
    safeMessage: sanitizeEnrichSafeMessage(promote.error, promote.step),
  };
}

export function unexpectedEnrichItemResult(input: {
  candidateId: string;
  candidateTitle: string;
}): EnrichSingleCandidateItemResult {
  return {
    candidateId: input.candidateId,
    candidateTitle: input.candidateTitle,
    ok: false,
    outcome: "unexpected_error",
    step: "unexpected",
    safeMessage: "예상하지 못한 오류가 발생했습니다.",
  };
}

export function summarizeBulkCandidateEnrich(
  results: EnrichSingleCandidateItemResult[]
): BulkCandidateEnrichSummary {
  let success = 0;
  let alreadyEnriched = 0;
  let sameEventBlocked = 0;
  let statusBlocked = 0;
  let enrichFailed = 0;
  let unexpectedError = 0;

  for (const r of results) {
    switch (r.outcome) {
      case "success":
        success += 1;
        break;
      case "already_enriched":
        alreadyEnriched += 1;
        break;
      case "same_event_blocked":
        sameEventBlocked += 1;
        break;
      case "status_blocked":
        statusBlocked += 1;
        break;
      case "enrich_failed":
        enrichFailed += 1;
        break;
      case "unexpected_error":
        unexpectedError += 1;
        break;
      default:
        unexpectedError += 1;
        break;
    }
  }

  return {
    total: results.length,
    success,
    alreadyEnriched,
    sameEventBlocked,
    statusBlocked,
    enrichFailed,
    unexpectedError,
    results,
  };
}

export function prioritizeBulkEnrichResults(
  results: EnrichSingleCandidateItemResult[]
): EnrichSingleCandidateItemResult[] {
  const order: Record<CandidateEnrichOutcome, number> = {
    unexpected_error: 0,
    enrich_failed: 1,
    same_event_blocked: 2,
    status_blocked: 3,
    already_enriched: 4,
    success: 5,
  };
  return [...results].sort((a, b) => order[a.outcome] - order[b.outcome]);
}

export function failedEnrichCandidateIds(
  summary: BulkCandidateEnrichSummary
): string[] {
  return summary.results
    .filter(
      (r) =>
        r.outcome === "enrich_failed" ||
        r.outcome === "unexpected_error"
    )
    .map((r) => r.candidateId);
}

/**
 * Client bulk enrich: one candidate per server call, sequential, no Promise.all.
 */
export async function runSequentialCandidateEnrich(
  ids: string[],
  titlesById: ReadonlyMap<string, string>,
  processOne: (candidateId: string) => Promise<EnrichSingleCandidateItemResult>,
  onProgress?: (input: {
    index: number;
    total: number;
    candidateId: string;
    candidateTitle: string;
  }) => void
): Promise<EnrichSingleCandidateItemResult[]> {
  const results: EnrichSingleCandidateItemResult[] = [];
  const succeeded = new Set<string>();

  for (let index = 0; index < ids.length; index += 1) {
    const candidateId = ids[index]!;
    if (succeeded.has(candidateId)) continue;

    const candidateTitle = titlesById.get(candidateId) ?? candidateId;
    onProgress?.({ index: index + 1, total: ids.length, candidateId, candidateTitle });

    try {
      const result = await processOne(candidateId);
      results.push(result);
      if (
        result.ok &&
        (result.outcome === "success" || result.outcome === "already_enriched")
      ) {
        succeeded.add(candidateId);
      }
    } catch {
      results.push(
        unexpectedEnrichItemResult({ candidateId, candidateTitle })
      );
    }
  }

  return results;
}
