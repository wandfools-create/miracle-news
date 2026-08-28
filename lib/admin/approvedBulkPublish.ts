import type { SameEventPublishMatch } from "@/lib/articles/publishArticle";

export type ApprovedBulkPublishItemResult =
  | {
      id: string;
      ok: true;
      title: string;
      alreadyPublished: boolean;
      sameEventNote?: SameEventPublishMatch;
    }
  | {
      id: string;
      ok: false;
      title?: string;
      step: string;
      error: string;
      excluded?: boolean;
    };

export type ApprovedBulkPublishSummary = {
  successCount: number;
  sameEventPublishedCount: number;
  excludedCount: number;
  failedCount: number;
  /** Full batch size before URL detail truncation. */
  totalResultCount: number;
  /** How many per-item rows are included in this payload. */
  displayedDetailCount: number;
  results: ApprovedBulkPublishItemResult[];
};

/** Conservative max encoded payload size (fits typical browser/proxy URL limits). */
export const APPROVED_BULK_PAYLOAD_MAX_URL_CHARS = 1800;

const MAX_TITLE_CHARS = 60;
const MAX_ERROR_CHARS = 80;

export function summarizeApprovedBulkPublish(
  results: ApprovedBulkPublishItemResult[]
): ApprovedBulkPublishSummary {
  let successCount = 0;
  let sameEventPublishedCount = 0;
  let excludedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    if (r.ok) {
      successCount += 1;
      if (r.sameEventNote) sameEventPublishedCount += 1;
    } else if (r.excluded) {
      excludedCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return {
    successCount,
    sameEventPublishedCount,
    excludedCount,
    failedCount,
    totalResultCount: results.length,
    displayedDetailCount: results.length,
    results,
  };
}

function sanitizeBulkError(error: string, step: string): string {
  const lower = error.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("service_role") ||
    lower.includes("apikey") ||
    lower.includes("stack")
  ) {
    return "서버 처리 오류";
  }
  if (step === "fetch" || step === "publish_update" || step === "localizations") {
    return "공개 처리 중 오류가 발생했습니다.";
  }
  return error.slice(0, MAX_ERROR_CHARS);
}

function compactItem(
  item: ApprovedBulkPublishItemResult
): ApprovedBulkPublishItemResult {
  if (item.ok) {
    return {
      ...item,
      title: item.title.slice(0, MAX_TITLE_CHARS),
      sameEventNote: item.sameEventNote
        ? {
            ...item.sameEventNote,
            title: item.sameEventNote.title.slice(0, MAX_TITLE_CHARS),
          }
        : undefined,
    };
  }
  return {
    ...item,
    title: item.title?.slice(0, MAX_TITLE_CHARS),
    error: sanitizeBulkError(item.error, item.step),
  };
}

/** Detail priority: failures → excluded → SAME EVENT warnings → plain success. */
export function prioritizeBulkPublishResults(
  results: ApprovedBulkPublishItemResult[]
): ApprovedBulkPublishItemResult[] {
  const failures = results.filter((r) => !r.ok && !r.excluded);
  const excluded = results.filter((r) => !r.ok && r.excluded);
  const sameEventSuccess = results.filter((r) => r.ok && r.sameEventNote);
  const plainSuccess = results.filter((r) => r.ok && !r.sameEventNote);
  return [...failures, ...excluded, ...sameEventSuccess, ...plainSuccess];
}

function payloadUrlLength(summary: ApprovedBulkPublishSummary): number {
  const encoded = Buffer.from(JSON.stringify(summary)).toString("base64url");
  return `batchPublish=1&batchPayload=${encoded}`.length;
}

/**
 * Keeps aggregate counts intact; trims detail rows to fit URL budget.
 * Never drops failure/excluded rows before plain success rows.
 */
export function compactApprovedBulkPublishForUrl(
  full: ApprovedBulkPublishSummary
): ApprovedBulkPublishSummary {
  const prioritized = prioritizeBulkPublishResults(full.results).map(compactItem);

  const failures = prioritized.filter((r) => !r.ok && !r.excluded);
  const excluded = prioritized.filter((r) => !r.ok && r.excluded);
  const sameEventSuccess = prioritized.filter((r) => r.ok && r.sameEventNote);
  const plainSuccess = prioritized.filter((r) => r.ok && !r.sameEventNote);

  const mustKeep = [...failures, ...excluded, ...sameEventSuccess];
  let selected = [...mustKeep];
  const trySummary = (rows: ApprovedBulkPublishItemResult[]) => ({
    successCount: full.successCount,
    sameEventPublishedCount: full.sameEventPublishedCount,
    excludedCount: full.excludedCount,
    failedCount: full.failedCount,
    totalResultCount: full.totalResultCount,
    displayedDetailCount: rows.length,
    results: rows,
  });

  if (payloadUrlLength(trySummary(selected)) > APPROVED_BULK_PAYLOAD_MAX_URL_CHARS) {
    selected = [
      ...failures.map((r) =>
        !r.ok
          ? { ...r, title: r.title?.slice(0, 24), error: r.error.slice(0, 40) }
          : r
      ),
      ...excluded.map((r) =>
        !r.ok
          ? { ...r, title: r.title?.slice(0, 24), error: r.error.slice(0, 40) }
          : r
      ),
      ...sameEventSuccess.map((r) =>
        r.ok ? { ...r, title: r.title.slice(0, 24) } : r
      ),
    ];
  }

  for (const item of plainSuccess) {
    const next = [...selected, item];
    if (
      payloadUrlLength(trySummary(next)) <= APPROVED_BULK_PAYLOAD_MAX_URL_CHARS
    ) {
      selected = next;
    } else {
      break;
    }
  }

  return trySummary(selected);
}

/** URL-safe compact payload for batch result banner. */
export function encodeApprovedBulkPublishPayload(
  summary: ApprovedBulkPublishSummary
): string {
  const compact = compactApprovedBulkPublishForUrl(summary);
  return Buffer.from(JSON.stringify(compact)).toString("base64url");
}

export function decodeApprovedBulkPublishPayload(
  encoded: string
): ApprovedBulkPublishSummary | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as ApprovedBulkPublishSummary;
    if (
      typeof parsed.successCount !== "number" ||
      typeof parsed.totalResultCount !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
