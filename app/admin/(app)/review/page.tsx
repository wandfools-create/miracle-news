import type { ReactNode } from "react";
import {
  bulkApproveArticles,
  bulkHoldArticles,
} from "./[id]/actions";
import SelectAllReviewCheckbox from "./SelectAllReviewCheckbox";
import ReviewArticleCard from "@/components/admin/ReviewArticleCard";
import { fetchReviewQueueArticles } from "@/lib/admin/fetchReviewQueueArticles";
import {
  normalizeReviewListRow,
  type ReviewQueueArticleRow,
} from "@/lib/admin/reviewArticleDisplay";

export const revalidate = 0;
export const dynamic = "force-dynamic";

function ReviewPageContent(props: {
  queryError: { code?: string; message: string } | null;
  limitApplied: number | null;
  failedArticles: Array<{
    id: string;
    error: string;
    failedField?: string;
  }>;
  cards: ReactNode;
  isEmpty: boolean;
}) {
  const { queryError, limitApplied, failedArticles, cards, isEmpty } = props;

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 검토 대기
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          검토 대기 기사
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
          사람 검토가 필요한 기사 목록입니다. RSS는 수집 후보 → 관리자 보강 → 검토
          대기 순으로 들어옵니다.
        </p>

        {limitApplied ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            디버그: REVIEW_DEBUG_LIMIT={limitApplied} (최근 {limitApplied}건만 조회)
          </p>
        ) : null}

        {queryError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mt-8">
            <p className="font-semibold">Supabase 쿼리 오류</p>
            {queryError.code ? (
              <p className="mt-1 font-mono text-xs">code: {queryError.code}</p>
            ) : null}
            <p className="mt-2">{queryError.message}</p>
            {queryError.code === "42703" ? (
              <p className="mt-2 text-xs">
                존재하지 않는 컬럼을 select 했을 때 발생합니다. 서버 로그의{" "}
                <code className="rounded bg-red-100 px-1">[admin/review] supabase query failed</code>
                를 확인하세요.
              </p>
            ) : null}
          </div>
        ) : null}

        {!queryError && failedArticles.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:mt-8">
            <p className="font-semibold">
              {failedArticles.length}건은 표시 중 오류가 있어 건너뛰었습니다.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs sm:text-sm">
              {failedArticles.map((row) => (
                <li key={row.id}>
                  기사 ID {row.id}
                  {row.failedField ? ` · 필드: ${row.failedField}` : ""}: {row.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!queryError && isEmpty && failedArticles.length === 0 ? (
          <div className="mt-6 rounded-2xl border p-5 text-sm text-gray-600 sm:mt-8 sm:p-6 sm:text-base">
            현재 검토 대기 기사가 없습니다.
          </div>
        ) : null}

        {!queryError && !isEmpty ? cards : null}
      </section>
    </main>
  );
}

export default async function AdminReviewPage() {
  console.info("[admin/review] page render start");

  try {
    const { articles, error: queryError, limitApplied } =
      await fetchReviewQueueArticles();

    const normalized = articles.map((row) =>
      normalizeReviewListRow(row as ReviewQueueArticleRow)
    );

    const displayArticles = normalized
      .filter((row): row is Extract<typeof row, { ok: true }> => row.ok)
      .map((row) => row.display);

    const failedArticles = normalized
      .filter((row): row is Extract<typeof row, { ok: false }> => !row.ok)
      .map((row) => ({
        id: row.id,
        error: row.error,
        failedField: row.failedField,
      }));

    if (failedArticles.length > 0) {
      console.error("[admin/review] skipped rows summary", failedArticles);
    }

    const cards =
      displayArticles.length > 0 ? (
        <>
          <form id="bulk-review-form" className="mt-6 sm:mt-8">
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-gray-50 p-4">
              <SelectAllReviewCheckbox targetName="articleIds" label="전체 선택" />

              <button
                type="submit"
                formAction={bulkApproveArticles}
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                선택 기사 일괄 승인
              </button>

              <button
                type="submit"
                formAction={bulkHoldArticles}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                선택 기사 일괄 보류
              </button>
            </div>
          </form>

          <div className="grid gap-3 sm:gap-4">
            {displayArticles.map((display) => (
              <ReviewArticleCard key={display.id} display={display} />
            ))}
          </div>
        </>
      ) : null;

    return (
      <ReviewPageContent
        queryError={queryError}
        limitApplied={limitApplied}
        failedArticles={failedArticles}
        cards={cards}
        isEmpty={displayArticles.length === 0}
      />
    );
  } catch (err) {
    console.error("[admin/review] page render threw", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    return (
      <main className="min-h-screen bg-white text-black">
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-bold text-red-800">검토 대기 페이지 오류</h1>
          <p className="mt-4 text-sm text-gray-700">
            예기치 않은 오류가 발생했습니다. 터미널에서{" "}
            <code className="rounded bg-gray-100 px-1">[admin/review] page render threw</code>
            로그를 확인하세요.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border bg-red-50 p-4 text-xs text-red-900">
            {err instanceof Error ? err.message : String(err)}
          </pre>
        </section>
      </main>
    );
  }
}
