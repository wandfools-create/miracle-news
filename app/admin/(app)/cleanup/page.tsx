import Link from "next/link";

import {
  archiveStaleReviewArticlesAction,
  expireStaleCandidatesAction,
} from "@/app/admin/(app)/cleanup/actions";
import { countStaleCleanupTargets } from "@/lib/admin/cleanup/countStaleItems";
import { CLEANUP_RETENTION_DAYS } from "@/lib/admin/cleanup/cleanupRules";
import { formatDateTimeKo } from "@/lib/articleWorkflow";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    confirm?: string;
    expired?: string;
    archived?: string;
    error?: string;
    detail?: string;
  }>;
};

function errorMessage(code: string | null | undefined, detail?: string | null) {
  if (!code) return null;
  if (code === "auth") return "관리자 권한이 필요합니다.";
  if (code === "confirm") return "실행 전 확인이 필요합니다.";
  if (code === "expire") {
    return `후보 정리에 실패했습니다.${detail ? ` (${detail})` : ""}`;
  }
  if (code === "archive") {
    return `검토대기 정리에 실패했습니다.${detail ? ` (${detail})` : ""}`;
  }
  return "요청을 처리하지 못했습니다.";
}

export default async function AdminCleanupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const confirm = params.confirm?.trim() || null;
  const counts = await countStaleCleanupTargets();
  const flashError = errorMessage(params.error, params.detail);
  const expiredDone = params.expired?.trim();
  const archivedDone = params.archived?.trim();

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 오래된 항목 정리
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          오래된 항목 정리
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
          {CLEANUP_RETENTION_DAYS}일 이상 지난 미사용 수집 후보·검토 대기만
          정리합니다. 공개·승인·보류·수정대기·주요뉴스·이미 기사로 연결된 후보는
          절대 건드리지 않습니다. 영구 삭제가 아니라 보관(만료/아카이브)
          처리입니다.
        </p>

        {counts.error ? (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            건수 조회 실패: {counts.error}
          </p>
        ) : null}

        {flashError ? (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {flashError}
          </p>
        ) : null}

        {expiredDone != null ? (
          <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            수집 후보 {expiredDone}건을 <strong>만료(expired)</strong> 처리했습니다.
          </p>
        ) : null}

        {archivedDone != null ? (
          <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            검토 대기 {archivedDone}건을 <strong>보관(archived)</strong>{" "}
            처리했습니다.
          </p>
        ) : null}

        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-800">
          <p>
            기준 시각(컷오프):{" "}
            <span className="font-medium">
              {formatDateTimeKo(counts.cutoffIso)}
            </span>
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              60일 초과 수집 후보(미사용):{" "}
              <strong>{counts.collectionCandidates}</strong>건
            </li>
            <li>
              60일 초과 검토 대기(미공개):{" "}
              <strong>{counts.reviewArticles}</strong>건
            </li>
          </ul>
        </div>

        {confirm === "candidates" ? (
          <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-5">
            <h2 className="text-lg font-semibold text-amber-950">
              확인: 60일 초과 후보 정리
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-950/90">
              pending / enrich_failed / dismissed 이면서 article_id가 없고{" "}
              {CLEANUP_RETENTION_DAYS}일을 넘긴 후보{" "}
              <strong>{counts.collectionCandidates}</strong>건을{" "}
              <strong>status=expired</strong>로 바꿉니다. 삭제가 아닙니다.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <form action={expireStaleCandidatesAction}>
                <input type="hidden" name="confirm" value="1" />
                <button
                  type="submit"
                  className="rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  만료 처리 실행
                </button>
              </form>
              <Link
                href="/admin/cleanup"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100"
              >
                취소
              </Link>
            </div>
          </div>
        ) : null}

        {confirm === "articles" ? (
          <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-5">
            <h2 className="text-lg font-semibold text-amber-950">
              확인: 60일 초과 검토대기 정리
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-950/90">
              검토 대기(ready_for_human_review + pending)이면서 미공개이고{" "}
              {CLEANUP_RETENTION_DAYS}일을 넘긴 기사{" "}
              <strong>{counts.reviewArticles}</strong>건을{" "}
              <strong>archived</strong>로 보관합니다. 공개·승인·보류·수정대기·주요뉴스는
              제외됩니다.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <form action={archiveStaleReviewArticlesAction}>
                <input type="hidden" name="confirm" value="1" />
                <button
                  type="submit"
                  className="rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                >
                  보관 처리 실행
                </button>
              </form>
              <Link
                href="/admin/cleanup"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100"
              >
                취소
              </Link>
            </div>
          </div>
        ) : null}

        {!confirm ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold">60일 초과 후보 정리</h2>
              <p className="mt-2 text-sm text-gray-600">
                대상 {counts.collectionCandidates}건 → expired
              </p>
              <Link
                href="/admin/cleanup?confirm=candidates"
                className="mt-4 inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                확인 화면으로
              </Link>
            </div>

            <div className="rounded-2xl border border-gray-200 p-5">
              <h2 className="text-base font-semibold">60일 초과 검토대기 정리</h2>
              <p className="mt-2 text-sm text-gray-600">
                대상 {counts.reviewArticles}건 → archived
              </p>
              <Link
                href="/admin/cleanup?confirm=articles"
                className="mt-4 inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                확인 화면으로
              </Link>
            </div>
          </div>
        ) : null}

        <p className="mt-10 text-xs text-gray-500">
          영구 삭제 기능은 별도로 추가할 수 있습니다. OpenAI는 호출하지 않습니다.
        </p>
      </section>
    </main>
  );
}
