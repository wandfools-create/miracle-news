/**
 * Pure collection-run helpers (no server-only / DB).
 */

export type CollectionRunStatus =
  | "running"
  | "success"
  | "partial"
  | "failed";

export type CollectionRunTriggerType =
  | "vercel_cron"
  | "github_actions"
  | "manual"
  | "unknown";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205", "PGRST204"]);

export function isCollectionRunsSchemaMissing(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}): boolean {
  const code = (error.code ?? "").trim();
  if (MISSING_TABLE_CODES.has(code)) return true;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    blob.includes("collection_runs") &&
    (blob.includes("does not exist") ||
      blob.includes("could not find") ||
      blob.includes("schema cache") ||
      blob.includes("not find the table"))
  );
}

export function sanitizeCollectionRunErrorSummary(
  value: string | null | undefined,
  maxLen = 240
): string | null {
  if (!value?.trim()) return null;
  let text = value.trim().replace(/\s+/g, " ");
  text = text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[jwt]")
    .replace(/sb_[A-Za-z0-9_\-]+/g, "[sb_key]")
    .replace(
      /(api[_-]?key|secret|password|token)\s*[:=]\s*\S+/gi,
      "$1=[redacted]"
    );
  if (text.length > maxLen) text = `${text.slice(0, maxLen)}…`;
  return text;
}

export function resolveCollectionRunStatus(input: {
  newCandidateCount: number;
  failedCount: number;
  hardFailed?: boolean;
}): CollectionRunStatus {
  if (input.hardFailed) return "failed";
  if (input.failedCount > 0 && input.newCandidateCount > 0) return "partial";
  if (input.failedCount > 0 && input.newCandidateCount === 0) return "failed";
  return "success";
}

export function resolveCollectionTriggerType(
  searchParams?: URLSearchParams | null
): CollectionRunTriggerType {
  if (!searchParams) return "unknown";
  const collectOnly =
    searchParams.get("collectOnly") === "1" ||
    searchParams.get("collectOnly") === "true";
  const forceBrief =
    searchParams.get("forceBrief") === "1" ||
    searchParams.get("forceBrief") === "true";
  if (collectOnly || forceBrief) return "github_actions";
  if (searchParams.get("manual") === "1") return "manual";
  return "vercel_cron";
}
