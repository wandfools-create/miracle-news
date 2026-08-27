/**
 * Articles AI-recommend snapshot columns (migration 20260827_*).
 *
 * Default OFF so pre-migration environments never UPDATE unknown columns
 * (no schema errors / no error logs on every promote).
 * After applying the migration, set ARTICLES_AI_RECOMMEND_SNAPSHOT=1.
 *
 * Runtime home ranking does not depend on this — it joins
 * collection_candidates.article_id instead.
 */
import {
  aiRecommendSnapshotForInsert,
} from "./aiRecommendSnapshot";

let snapshotMarkedUnavailable = false;

export function isArticlesAiRecommendSnapshotEnabled(): boolean {
  if (snapshotMarkedUnavailable) return false;
  const raw = process.env.ARTICLES_AI_RECOMMEND_SNAPSHOT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Test / process reset only. */
export function resetArticlesAiRecommendSnapshotCapabilityForTests(): void {
  snapshotMarkedUnavailable = false;
}

function isMissingColumnSchemaError(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST204" || code === "42703") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("ai_recommend_grade") ||
    msg.includes("ai_recommend_score") ||
    msg.includes("schema cache") ||
    (msg.includes("column") && msg.includes("does not exist"))
  );
}

/**
 * Best-effort write of candidate AI grade/score onto articles.
 * No-ops when capability is off or columns were previously marked missing.
 * Never logs secrets or full Supabase error payloads.
 */
export async function maybeWriteArticleAiRecommendSnapshot(input: {
  client: {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (
          column: string,
          value: string
        ) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
      };
    };
  };
  articleId: string;
  grade?: unknown;
  score?: unknown;
}): Promise<"written" | "skipped" | "unavailable"> {
  if (!isArticlesAiRecommendSnapshotEnabled()) return "skipped";

  const snap = aiRecommendSnapshotForInsert({
    grade: input.grade,
    score: input.score,
  });
  if (snap.ai_recommend_grade == null && snap.ai_recommend_score == null) {
    return "skipped";
  }

  const { error } = await input.client
    .from("articles")
    .update(snap)
    .eq("id", input.articleId);

  if (!error) return "written";

  if (isMissingColumnSchemaError(error)) {
    snapshotMarkedUnavailable = true;
    return "unavailable";
  }

  // Non-schema failures: one-line code only (no message — may echo request context).
  console.info(
    "[collection-candidates] ai recommend snapshot write failed",
    error.code ?? "unknown"
  );
  return "skipped";
}
