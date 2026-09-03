/**
 * Atomic review-complete-and-publish — behavioral tests with injectable RPC /
 * in-memory transaction simulator. No real DB / OpenAI / Discord.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import {
  isPendingReviewArticle,
  isQuickReviewArticle,
  validateQuickPublishContent,
  type PublishArticleFields,
} from "@/lib/articles/quickPublishGuards";
import {
  buildReviewCompleteLocalizationPayloads,
  pickNextPendingReviewArticleId,
  runReviewCompleteAndPublish,
  type ReviewCompletePublishArticleRow,
  type ReviewCompletePublishCoreDeps,
} from "@/lib/articles/reviewCompletePublishCore";
import {
  REVIEW_COMPLETE_PUBLISH_NOT_READY_ERROR,
  createSupabaseReviewCompletePublishRpc,
  isReviewCompletePublishRpcMissing,
  parseReviewCompletePublishRpcPayload,
  type ReviewCompletePublishRpcPort,
} from "@/lib/articles/reviewCompletePublishRpc";
import {
  createEmptySimulatedReviewPublishDb,
  simulateReviewCompletePublishTransaction,
  type SimulatedArticleRow,
} from "@/lib/articles/reviewCompletePublishTransaction";

const ARTICLE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";

function pendingArticle(
  partial: Partial<PublishArticleFields> = {}
): ReviewCompletePublishArticleRow {
  return {
    id: ARTICLE_ID,
    published_at: null,
    title_original: "English title",
    body_original: "English body paragraph.",
    summary_original: "English summary.",
    title_translated: "한국어 제목",
    body_translated: "한국어 본문 첫 문단입니다.\n\n두 번째 문단입니다.",
    summary_translated: "한국어 요약입니다.",
    title_ko: "한국어 제목",
    summary_ko: "한국어 요약입니다.",
    review_status: "pending",
    status: "ready_for_human_review",
    is_published: false,
    ai_review_status: "ok",
    ai_review_notes: null,
    source: "AP",
    thumbnail_url: null,
    ...partial,
  };
}

function pendingSimRow(
  partial: Partial<SimulatedArticleRow> = {}
): SimulatedArticleRow {
  return {
    id: ARTICLE_ID,
    status: "ready_for_human_review",
    review_status: "pending",
    revision_status: "none",
    is_published: false,
    published_at: null,
    approved_at: null,
    approved_by: null,
    ...partial,
  };
}

function localizationInput(article = pendingArticle()) {
  const payloads = buildReviewCompleteLocalizationPayloads(article);
  return {
    articleId: article.id,
    approvedBy: "editor@example.com",
    ko: payloads.ko,
    en: payloads.en,
  };
}

function depsWith(overrides: {
  article?: ReviewCompletePublishArticleRow | null;
  fetchError?: string;
  sameEventBlocked?: boolean;
  rpc: ReviewCompletePublishRpcPort;
}): ReviewCompletePublishCoreDeps {
  const article = overrides.article === undefined ? pendingArticle() : overrides.article;
  return {
    fetchArticle: async () => {
      if (overrides.fetchError) {
        return { ok: false, error: overrides.fetchError };
      }
      if (!article) {
        return { ok: false, error: "기사를 찾을 수 없습니다." };
      }
      return { ok: true, article };
    },
    evaluateSameEvent: async () => {
      if (overrides.sameEventBlocked) {
        return {
          blocked: true as const,
          match: {
            id: "pub-1",
            source: "AP",
            title: "Already published same event",
            publishedAt: "2026-08-01T00:00:00Z",
          },
        };
      }
      return { blocked: false as const };
    },
    rpc: overrides.rpc,
  };
}

describe("review complete and publish — guards", () => {
  it("isPendingReviewArticle accepts only pending review queue rows", () => {
    assert.equal(isPendingReviewArticle(pendingArticle()), true);
    assert.equal(
      isPendingReviewArticle(pendingArticle({ review_status: "quick_review" })),
      false
    );
    assert.equal(
      isPendingReviewArticle(pendingArticle({ is_published: true })),
      false
    );
    assert.equal(
      isPendingReviewArticle(
        pendingArticle({ status: "approved", review_status: "approved" })
      ),
      false
    );
  });

  it("does not treat approved holding rows as pending review publish targets", () => {
    const approvedHolding = pendingArticle({
      status: "approved",
      review_status: "approved",
      is_published: false,
    });
    assert.equal(isPendingReviewArticle(approvedHolding), false);
    assert.equal(isQuickReviewArticle(approvedHolding), false);
  });

  it("content guard blocks empty fields before publish", () => {
    assert.equal(validateQuickPublishContent(pendingArticle()).ok, true);
    assert.equal(
      validateQuickPublishContent(
        pendingArticle({
          title_ko: "",
          title_translated: "",
          title_original: "",
        })
      ).ok,
      false
    );
  });

  it("admin email allowlist rejects empty/non-admin emails", () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "editor@example.com";
    try {
      assert.equal(isAllowedAdminEmail(null), false);
      assert.equal(isAllowedAdminEmail(""), false);
      assert.equal(isAllowedAdminEmail("user@example.com"), false);
      assert.equal(isAllowedAdminEmail("editor@example.com"), true);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });

  it("builds localization payloads from DB article fields", () => {
    const payloads = buildReviewCompleteLocalizationPayloads(pendingArticle());
    assert.equal(payloads.ko.title, "한국어 제목");
    assert.equal(payloads.en.title, "English title");
    assert.match(payloads.ko.slug, new RegExp(ARTICLE_ID.slice(0, 8)));
  });

  it("pickNextPendingReviewArticleId ignores published id and uses server order", () => {
    assert.equal(
      pickNextPendingReviewArticleId([ARTICLE_ID, OTHER_ID], ARTICLE_ID),
      OTHER_ID
    );
    assert.equal(pickNextPendingReviewArticleId([ARTICLE_ID], ARTICLE_ID), null);
    assert.equal(pickNextPendingReviewArticleId([], ARTICLE_ID), null);
  });
});

describe("review complete and publish — core orchestration", () => {
  it("RPC missing → fails closed with 준비 중 and never reports success", async () => {
    let rpcCalls = 0;
    const rpc: ReviewCompletePublishRpcPort = {
      async call() {
        rpcCalls += 1;
        return { kind: "missing_function" };
      },
    };
    const result = await runReviewCompleteAndPublish(
      ARTICLE_ID,
      { approvedBy: "editor@example.com" },
      depsWith({ rpc })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.step, "rpc_unavailable");
      assert.equal(result.error, REVIEW_COMPLETE_PUBLISH_NOT_READY_ERROR);
    }
    assert.equal(rpcCalls, 1);
  });

  it("quality failure does not call RPC", async () => {
    let rpcCalls = 0;
    const result = await runReviewCompleteAndPublish(
      ARTICLE_ID,
      { approvedBy: "editor@example.com" },
      depsWith({
        article: pendingArticle({
          title_ko: "",
          title_translated: "",
          title_original: "",
          body_translated: "",
          body_original: "",
          summary_ko: "",
          summary_translated: "",
          summary_original: "",
        }),
        rpc: {
          async call() {
            rpcCalls += 1;
            return {
              kind: "result",
              result: {
                ok: true,
                published_at: "2026-08-31T00:00:00Z",
                first_publish: true,
              },
            };
          },
        },
      })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.step, "content_guard");
    assert.equal(rpcCalls, 0);
  });

  it("SAME EVENT block does not call RPC without explicit override", async () => {
    let rpcCalls = 0;
    const result = await runReviewCompleteAndPublish(
      ARTICLE_ID,
      { approvedBy: "editor@example.com" },
      depsWith({
        sameEventBlocked: true,
        rpc: {
          async call() {
            rpcCalls += 1;
            return {
              kind: "result",
              result: {
                ok: true,
                published_at: "2026-08-31T00:00:00Z",
                first_publish: true,
              },
            };
          },
        },
      })
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.step, "same_event_guard");
      assert.ok(result.sameEventMatch);
    }
    assert.equal(rpcCalls, 0);
  });

  it("SAME EVENT override calls RPC (still not auto-publish — explicit option)", async () => {
    let rpcCalls = 0;
    const result = await runReviewCompleteAndPublish(
      ARTICLE_ID,
      {
        approvedBy: "editor@example.com",
        allowSameEventOverride: true,
      },
      depsWith({
        sameEventBlocked: true,
        rpc: {
          async call(input) {
            rpcCalls += 1;
            assert.equal(input.approvedBy, "editor@example.com");
            assert.equal(input.ko.title, "한국어 제목");
            return {
              kind: "result",
              result: {
                ok: true,
                published_at: "2026-08-31T12:00:00Z",
                first_publish: true,
              },
            };
          },
        },
      })
    );
    assert.equal(result.ok, true);
    assert.equal(rpcCalls, 1);
  });

  it("non-pending / approved holding status is rejected before RPC", async () => {
    let rpcCalls = 0;
    const result = await runReviewCompleteAndPublish(
      ARTICLE_ID,
      { approvedBy: "editor@example.com" },
      depsWith({
        article: pendingArticle({
          status: "approved",
          review_status: "approved",
          is_published: false,
        }),
        rpc: {
          async call() {
            rpcCalls += 1;
            return {
              kind: "result",
              result: {
                ok: true,
                published_at: "2026-08-31T00:00:00Z",
                first_publish: true,
              },
            };
          },
        },
      })
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.step, "status_guard");
    assert.equal(rpcCalls, 0);
  });

  it("already published is idempotent without RPC write", async () => {
    let rpcCalls = 0;
    const result = await runReviewCompleteAndPublish(
      ARTICLE_ID,
      { approvedBy: "editor@example.com" },
      depsWith({
        article: pendingArticle({
          is_published: true,
          status: "published",
          review_status: "approved",
          published_at: "2026-08-01T00:00:00Z",
        }),
        rpc: {
          async call() {
            rpcCalls += 1;
            return { kind: "missing_function" };
          },
        },
      })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.firstPublish, false);
      assert.equal(result.publishedAt, "2026-08-01T00:00:00Z");
    }
    assert.equal(rpcCalls, 0);
  });

  it("successful RPC maps first publish result", async () => {
    const result = await runReviewCompleteAndPublish(
      ARTICLE_ID,
      { approvedBy: "editor@example.com" },
      depsWith({
        rpc: {
          async call() {
            return {
              kind: "result",
              result: {
                ok: true,
                published_at: "2026-08-31T15:00:00Z",
                first_publish: true,
              },
            };
          },
        },
      })
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.firstPublish, true);
      assert.equal(result.publishedAt, "2026-08-31T15:00:00Z");
    }
  });
});

describe("review complete and publish — transaction rollback / race", () => {
  it("localization failure rolls back and leaves article unpublished", async () => {
    const db = createEmptySimulatedReviewPublishDb();
    db.articles.set(ARTICLE_ID, pendingSimRow());

    const result = await simulateReviewCompletePublishTransaction(
      db,
      localizationInput(),
      { fault: "localization_en_fail" }
    );

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.step, "localizations");
    const article = db.articles.get(ARTICLE_ID)!;
    assert.equal(article.is_published, false);
    assert.equal(article.review_status, "pending");
    assert.equal(db.localizations.length, 0);
  });

  it("article status transition failure rolls back localizations", async () => {
    const db = createEmptySimulatedReviewPublishDb();
    db.articles.set(ARTICLE_ID, pendingSimRow());

    const result = await simulateReviewCompletePublishTransaction(
      db,
      localizationInput(),
      { fault: "publish_update_fail" }
    );

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.step, "publish_update");
    assert.equal(db.articles.get(ARTICLE_ID)!.is_published, false);
    assert.equal(db.localizations.length, 0);
  });

  it("concurrent requests: only one first_publish", async () => {
    const db = createEmptySimulatedReviewPublishDb();
    db.articles.set(ARTICLE_ID, pendingSimRow());
    const input = localizationInput();

    const [a, b] = await Promise.all([
      simulateReviewCompletePublishTransaction(db, input, {
        now: "2026-08-31T10:00:00.000Z",
      }),
      simulateReviewCompletePublishTransaction(db, input, {
        now: "2026-08-31T10:00:01.000Z",
      }),
    ]);

    const firsts = [a, b].filter((r) => r.ok && r.first_publish);
    const seconds = [a, b].filter((r) => r.ok && !r.first_publish);
    assert.equal(firsts.length, 1);
    assert.equal(seconds.length, 1);
    assert.equal(db.articles.get(ARTICLE_ID)!.is_published, true);
    assert.equal(
      db.localizations.filter((l) => l.article_id === ARTICLE_ID).length,
      2
    );
  });

  it("already published returns idempotent success without rewriting", async () => {
    const db = createEmptySimulatedReviewPublishDb();
    db.articles.set(
      ARTICLE_ID,
      pendingSimRow({
        is_published: true,
        status: "published",
        review_status: "approved",
        published_at: "2026-07-01T00:00:00Z",
        approved_by: "original@example.com",
      })
    );
    db.localizations.push({
      article_id: ARTICLE_ID,
      locale: "ko",
      title: "old",
      summary: "old",
      body: "old",
      slug: "old",
      meta_description: "old",
    });

    const result = await simulateReviewCompletePublishTransaction(
      db,
      localizationInput(),
      { now: "2026-08-31T12:00:00Z" }
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.first_publish, false);
      assert.equal(result.published_at, "2026-07-01T00:00:00Z");
    }
    assert.equal(db.localizations[0]!.title, "old");
    assert.equal(db.articles.get(ARTICLE_ID)!.approved_by, "original@example.com");
  });

  it("happy path upserts KO/EN and publishes atomically", async () => {
    const db = createEmptySimulatedReviewPublishDb();
    db.articles.set(ARTICLE_ID, pendingSimRow());
    const result = await simulateReviewCompletePublishTransaction(
      db,
      localizationInput(),
      { now: "2026-08-31T09:00:00Z" }
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.first_publish, true);
    const article = db.articles.get(ARTICLE_ID)!;
    assert.equal(article.is_published, true);
    assert.equal(article.status, "published");
    assert.equal(article.review_status, "approved");
    assert.equal(article.approved_by, "editor@example.com");
    assert.equal(db.localizations.length, 2);
  });
});

describe("review complete and publish — RPC helpers / wiring", () => {
  it("detects missing RPC error codes", () => {
    assert.equal(
      isReviewCompletePublishRpcMissing({ code: "PGRST202", message: "x" }),
      true
    );
    assert.equal(
      isReviewCompletePublishRpcMissing({
        code: "XX000",
        message: "Could not find the function review_complete_and_publish_article",
      }),
      true
    );
    assert.equal(
      isReviewCompletePublishRpcMissing({
        code: "42501",
        message: "permission denied",
      }),
      false
    );
  });

  it("parseReviewCompletePublishRpcPayload accepts ok/err shapes", () => {
    assert.deepEqual(
      parseReviewCompletePublishRpcPayload({
        ok: true,
        published_at: "2026-08-31T00:00:00Z",
        first_publish: true,
      }),
      {
        ok: true,
        published_at: "2026-08-31T00:00:00Z",
        first_publish: true,
      }
    );
    assert.deepEqual(
      parseReviewCompletePublishRpcPayload({
        ok: false,
        step: "localizations",
        error: "invalid_ko_localization",
      }),
      {
        ok: false,
        step: "localizations",
        error: "invalid_ko_localization",
      }
    );
  });

  it("createSupabaseReviewCompletePublishRpc maps missing function", async () => {
    const port = createSupabaseReviewCompletePublishRpc({
      async rpc() {
        return {
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find the function",
          },
        };
      },
    });
    const outcome = await port.call(localizationInput());
    assert.equal(outcome.kind, "missing_function");
  });

  it("publishArticle reviewComplete path does not call publishArticleToLive", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/articles/publishArticle.ts"),
      "utf8"
    );
    const fnStart = src.indexOf(
      "export async function reviewCompleteAndPublishArticle"
    );
    const fnEnd = src.indexOf(
      "export async function sendQuickReviewToReviewQueue",
      fnStart
    );
    const body = src.slice(fnStart, fnEnd);
    assert.match(body, /runReviewCompleteAndPublish/);
    assert.match(body, /createSupabaseReviewCompletePublishRpc/);
    assert.doesNotMatch(body, /publishArticleToLive\(/);
  });

  it("publishActions re-queries next pending after publish and requires admin", () => {
    const actions = readFileSync(
      join(process.cwd(), "app/admin/(app)/review/publishActions.ts"),
      "utf8"
    );
    assert.match(actions, /requireAdmin/);
    assert.match(actions, /isAllowedAdminEmail/);
    assert.match(actions, /fetchNextPendingReviewArticleIdAfterPublish/);
    assert.match(actions, /Client nextArticleId is ignored/);
    const publishFn = actions.slice(
      actions.indexOf("export async function reviewCompleteAndPublishFromForm"),
      actions.indexOf("export async function mobileHoldFromForm")
    );
    assert.doesNotMatch(
      publishFn,
      /formData\.get\("nextArticleId"\)/
    );
  });

  it("RPC migration includes localization payloads and hardened grants", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "migrations/20260831_review_complete_publish_rpc.sql"
      ),
      "utf8"
    );
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = public/);
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /p_ko jsonb/);
    assert.match(sql, /p_en jsonb/);
    assert.match(sql, /article_localizations/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM anon/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM authenticated/);
    assert.match(sql, /GRANT EXECUTE[\s\S]*TO service_role/);
    assert.match(sql, /EXCEPTION/);
  });

  it("AdminQuickNav keeps approved as secondary archive", () => {
    const nav = readFileSync(
      join(process.cwd(), "components/admin/AdminQuickNav.tsx"),
      "utf8"
    );
    assert.match(nav, /이전 승인 보관함/);
    assert.match(nav, /secondaryNavItems/);
    assert.doesNotMatch(nav, /primaryNavItems[\s\S]*label: "승인 완료"/);
  });

  it("review UI exposes publish, not legacy approve-only actions", () => {
    const card = readFileSync(
      join(process.cwd(), "components/admin/ReviewArticleCard.tsx"),
      "utf8"
    );
    const detail = readFileSync(
      join(process.cwd(), "app/admin/(app)/review/[id]/page.tsx"),
      "utf8"
    );
    const list = readFileSync(
      join(process.cwd(), "app/admin/(app)/review/page.tsx"),
      "utf8"
    );

    assert.match(card, /reviewCompleteAndPublishFromForm/);
    assert.match(card, /검토 완료 및 공개/);
    assert.doesNotMatch(card, /approveArticleFromForm|빠른 승인/);
    assert.doesNotMatch(detail, /approveArticleDetailFromForm|공개 없음/);
    assert.doesNotMatch(list, /bulkApproveArticles|선택 기사 일괄 승인/);
  });
});
