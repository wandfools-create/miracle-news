/**
 * Mobile review-complete-and-publish fixtures — no DB / OpenAI / Discord.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ARTICLE_WORKFLOW } from "@/lib/articleWorkflow";
import {
  isPendingReviewArticle,
  isQuickReviewArticle,
  validateQuickPublishContent,
  type PublishArticleFields,
} from "@/lib/articles/quickPublishGuards";
import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";

const ARTICLE_ID = "33333333-3333-4333-8333-333333333333";

function pendingArticle(
  partial: Partial<PublishArticleFields> = {}
): PublishArticleFields {
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
    ...partial,
  };
}

describe("review complete and publish (fixture only)", () => {
  it("isPendingReviewArticle accepts only pending review queue rows", () => {
    assert.equal(isPendingReviewArticle(pendingArticle()), true);
    assert.equal(
      isPendingReviewArticle(
        pendingArticle({ review_status: "quick_review" })
      ),
      false
    );
    assert.equal(
      isPendingReviewArticle(pendingArticle({ is_published: true })),
      false
    );
    assert.equal(
      isPendingReviewArticle(
        pendingArticle({
          status: "approved",
          review_status: "approved",
        })
      ),
      false
    );
    assert.notEqual(
      ARTICLE_WORKFLOW.review.review_status,
      ARTICLE_WORKFLOW.quickReview.review_status
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

  it("wires requireAdmin on review publish actions and next-article redirects", () => {
    const actions = readFileSync(
      join(process.cwd(), "app/admin/(app)/review/publishActions.ts"),
      "utf8"
    );
    assert.match(actions, /requireAdmin/);
    assert.match(actions, /isAllowedAdminEmail/);
    assert.match(actions, /reviewCompleteAndPublishArticle/);
    assert.match(actions, /nextArticleId/);
    assert.match(actions, /\/admin\/review\/mobile/);
    assert.match(actions, /allowSameEventOverride/);
    assert.doesNotMatch(actions, /bulkPublishApproved/);
  });

  it("publishArticle exports reviewCompleteAndPublishArticle with pending guard", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/articles/publishArticle.ts"),
      "utf8"
    );
    assert.match(src, /export async function reviewCompleteAndPublishArticle/);
    assert.match(src, /isPendingReviewArticle/);
    assert.match(src, /requireReviewStatus: ARTICLE_WORKFLOW\.review\.review_status/);
    assert.match(src, /approvedBy/);
  });

  it("AdminQuickNav moves approved to secondary archive label", () => {
    const nav = readFileSync(
      join(process.cwd(), "components/admin/AdminQuickNav.tsx"),
      "utf8"
    );
    assert.match(nav, /이전 승인 보관함/);
    assert.match(nav, /secondaryNavItems/);
    assert.match(nav, /모바일 검토/);
    assert.match(nav, /\/admin\/review\/mobile/);
    assert.doesNotMatch(
      nav,
      /primaryNavItems[\s\S]*label: "승인 완료"/
    );
  });

  it("mobile review UI has primary publish button and pending submit guard", () => {
    const ui = readFileSync(
      join(process.cwd(), "components/admin/MobileReviewDetail.tsx"),
      "utf8"
    );
    assert.match(ui, /검토 완료 및 공개/);
    assert.match(ui, /useFormStatus/);
    assert.match(ui, /aria-busy/);
    assert.match(ui, /pb-\[env\(safe-area-inset-bottom\)\]/);
    assert.match(ui, /min-h-\[48px\]/);
    assert.match(ui, /수정 대기/);
    assert.match(ui, /반려/);
  });

  it("RPC migration hardens SECURITY DEFINER execute grants", () => {
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
    assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM anon/);
    assert.match(sql, /REVOKE ALL[\s\S]*FROM authenticated/);
    assert.match(sql, /GRANT EXECUTE[\s\S]*TO service_role/);
    assert.match(sql, /review_status = 'pending'/);
  });

  it("desktop review detail exposes review-complete publish without removing approve archive", () => {
    const page = readFileSync(
      join(process.cwd(), "app/admin/(app)/review/[id]/page.tsx"),
      "utf8"
    );
    assert.match(page, /reviewCompleteAndPublishDetailFromForm/);
    assert.match(page, /검토 완료 및 공개/);
    assert.match(page, /승인 완료로 이동 \(공개 없음\)/);
    assert.match(page, /\/admin\/review\/mobile\//);
  });
});
