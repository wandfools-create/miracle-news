/**
 * In-memory model of review_complete_and_publish_article transaction semantics.
 * Used for rollback / race unit tests without touching a real database.
 * Must stay aligned with migrations/20260831_review_complete_publish_rpc.sql.
 */

import type {
  ReviewCompleteLocalizationPayload,
  ReviewCompletePublishRpcInput,
  ReviewCompletePublishRpcResult,
} from "@/lib/articles/reviewCompletePublishRpc";

export type SimulatedArticleRow = {
  id: string;
  status: string;
  review_status: string;
  revision_status?: string | null;
  is_published: boolean;
  published_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
};

export type SimulatedLocalizationRow = {
  article_id: string;
  locale: "ko" | "en";
  title: string;
  summary: string | null;
  body: string | null;
  slug: string;
  meta_description: string | null;
};

export type SimulatedReviewPublishDb = {
  articles: Map<string, SimulatedArticleRow>;
  localizations: SimulatedLocalizationRow[];
  /** Serialize concurrent FOR UPDATE on the same article id. */
  locks: Map<string, Promise<void>>;
};

export type SimulatedTransactionFault =
  | null
  | "localization_ko_fail"
  | "localization_en_fail"
  | "localization_verify_fail"
  | "publish_update_fail";

function cloneDb(db: SimulatedReviewPublishDb): SimulatedReviewPublishDb {
  return {
    articles: new Map(
      [...db.articles.entries()].map(([k, v]) => [k, { ...v }])
    ),
    localizations: db.localizations.map((row) => ({ ...row })),
    locks: db.locks,
  };
}

function replaceDb(target: SimulatedReviewPublishDb, source: SimulatedReviewPublishDb) {
  target.articles.clear();
  for (const [k, v] of source.articles) target.articles.set(k, v);
  target.localizations.splice(0, target.localizations.length, ...source.localizations);
}

function upsertLocale(
  db: SimulatedReviewPublishDb,
  articleId: string,
  locale: "ko" | "en",
  payload: ReviewCompleteLocalizationPayload,
  isPrimary: boolean
) {
  const idx = db.localizations.findIndex(
    (row) => row.article_id === articleId && row.locale === locale
  );
  const next: SimulatedLocalizationRow = {
    article_id: articleId,
    locale,
    title: payload.title,
    summary: payload.summary,
    body: payload.body,
    slug: payload.slug,
    meta_description: payload.meta_description,
  };
  if (idx >= 0) db.localizations[idx] = next;
  else db.localizations.push(next);
  void isPrimary;
}

function validatePayload(
  input: ReviewCompletePublishRpcInput
): ReviewCompletePublishRpcResult | null {
  const ko = input.ko;
  const en = input.en;
  if (!ko?.title?.trim() || !ko.body?.trim() || !ko.summary?.trim() || !ko.slug?.trim()) {
    return { ok: false, step: "localizations", error: "invalid_ko_localization" };
  }
  if (!en?.title?.trim() || !en.slug?.trim()) {
    return { ok: false, step: "localizations", error: "invalid_en_localization" };
  }
  return null;
}

/**
 * Run one atomic publish attempt against an in-memory DB.
 * Concurrent calls on the same id wait on a lock (FOR UPDATE).
 */
export async function simulateReviewCompletePublishTransaction(
  db: SimulatedReviewPublishDb,
  input: ReviewCompletePublishRpcInput,
  options?: {
    fault?: SimulatedTransactionFault;
    now?: string;
  }
): Promise<ReviewCompletePublishRpcResult> {
  const invalid = validatePayload(input);
  if (invalid) return invalid;

  const prev = db.locks.get(input.articleId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  db.locks.set(
    input.articleId,
    prev.then(() => gate)
  );
  await prev;

  const snapshot = cloneDb(db);
  const now = options?.now ?? new Date().toISOString();
  const fault = options?.fault ?? null;

  try {
    const row = db.articles.get(input.articleId);
    if (!row) {
      return { ok: false, step: "fetch", error: "not_found" };
    }

    if (row.is_published || row.status === "published") {
      return {
        ok: true,
        published_at: row.published_at ?? now,
        first_publish: false,
      };
    }

    if (
      row.review_status !== "pending" ||
      row.status !== "ready_for_human_review"
    ) {
      return { ok: false, step: "status_guard", error: "not_pending_review" };
    }

    if (fault === "localization_ko_fail") {
      throw new Error("localization_ko_fail");
    }
    upsertLocale(db, input.articleId, "ko", input.ko, true);

    if (fault === "localization_en_fail") {
      throw new Error("localization_en_fail");
    }
    upsertLocale(db, input.articleId, "en", input.en, false);

    if (fault === "localization_verify_fail") {
      throw new Error("localization_verify_failed");
    }

    const verified = db.localizations.filter(
      (loc) =>
        loc.article_id === input.articleId &&
        (loc.locale === "ko" || loc.locale === "en") &&
        loc.title.trim()
    );
    if (verified.length < 2) {
      throw new Error("localization_verify_failed");
    }

    if (fault === "publish_update_fail") {
      throw new Error("publish_update_race");
    }

    if (
      row.review_status !== "pending" ||
      row.status !== "ready_for_human_review" ||
      row.is_published
    ) {
      throw new Error("publish_update_race");
    }

    row.status = "published";
    row.review_status = "approved";
    row.revision_status = "none";
    row.is_published = true;
    row.published_at = row.published_at ?? now;
    row.approved_at = now;
    row.approved_by = input.approvedBy.trim() || "admin";

    return {
      ok: true,
      published_at: row.published_at,
      first_publish: true,
    };
  } catch (err) {
    replaceDb(db, snapshot);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      step:
        message.includes("localization")
          ? "localizations"
          : message.includes("publish_update")
            ? "publish_update"
            : "rpc",
      error: message,
    };
  } finally {
    release();
  }
}

export function createEmptySimulatedReviewPublishDb(): SimulatedReviewPublishDb {
  return {
    articles: new Map(),
    localizations: [],
    locks: new Map(),
  };
}
