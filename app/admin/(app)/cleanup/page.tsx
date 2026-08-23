import Link from "next/link";
import type { ReactNode } from "react";

import {
  archiveStaleRejectedArticlesAction,
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
    rejectedArchived?: string;
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
  if (code === "rejected") {
    return `반려 정리에 실패했습니다.${detail ? ` (${detail})` : ""}`;
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
  const rejectedDone = params.rejectedArchived?.trim();

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
          {CLEANUP_RETENTION_DAYS}일 초과 미사용 후보·미처리 검토대기·반려를
          보관 처리합니다. 보류·수정대기·승인·공개·주요뉴스·연결된 후보는
          절대 건드리지 않습니다. 결과는{" "}
          <Link href="/admin/archive" className="underline">
            보관함
          </Link>
          에서 확인합니다.
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

        {rejectedDone != null ? (
          <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            반려 {rejectedDone}건을 <strong>보관(archived)</strong> 처리했습니다.
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
            <li>
              60일 초과 반려: <strong>{counts.rejectedArticles}</strong>건
            </li>
          </ul>
        </div>

        {confirm === "candidates" ? (
          <ConfirmCard
            title="확인: 60일 초과 후보 정리"
            body={
              <>
                pending / enrich_failed / dismissed 이면서 article_id가 없고{" "}
                {CLEANUP_RETENTION_DAYS}일을 넘긴 후보{" "}
                <strong>{counts.collectionCandidates}</strong>건을{" "}
                <strong>status=expired</strong>로 바꿉니다.
              </>
            }
            action={expireStaleCandidatesAction}
            submitLabel="만료 처리 실행"
          />
        ) : null}

        {confirm === "articles" ? (
          <ConfirmCard
            title="확인: 60일 초과 검토대기 정리"
            body={
              <>
                검토 대기 {counts.reviewArticles}건을{" "}
                <strong>archived</strong>로 보관합니다.
              </>
            }
            action={archiveStaleReviewArticlesAction}
            submitLabel="보관 처리 실행"
          />
        ) : null}

        {confirm === "rejected" ? (
          <ConfirmCard
            title="확인: 60일 초과 반려 정리"
            body={
              <>
                반려 {counts.rejectedArticles}건을 <strong>archived</strong>로
                보관합니다. 보류·수정대기·승인·공개는 제외됩니다.
              </>
            }
            action={archiveStaleRejectedArticlesAction}
            submitLabel="보관 처리 실행"
          />
        ) : null}

        {!confirm ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <ActionCard
              title="60일 초과 후보 정리"
              count={counts.collectionCandidates}
              href="/admin/cleanup?confirm=candidates"
              result="→ expired"
            />
            <ActionCard
              title="60일 초과 검토대기 정리"
              count={counts.reviewArticles}
              href="/admin/cleanup?confirm=articles"
              result="→ archived"
            />
            <ActionCard
              title="60일 초과 반려 정리"
              count={counts.rejectedArticles}
              href="/admin/cleanup?confirm=rejected"
              result="→ archived"
            />
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ActionCard(props: {
  title: string;
  count: number;
  href: string;
  result: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold">{props.title}</h2>
      <p className="mt-2 text-sm text-gray-600">
        대상 {props.count}건 {props.result}
      </p>
      <Link
        href={props.href}
        className="mt-4 inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
      >
        확인 화면으로
      </Link>
    </div>
  );
}

function ConfirmCard(props: {
  title: string;
  body: ReactNode;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-5">
      <h2 className="text-lg font-semibold text-amber-950">{props.title}</h2>
      <p className="mt-2 text-sm leading-6 text-amber-950/90">{props.body}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <form action={props.action}>
          <input type="hidden" name="confirm" value="1" />
          <button
            type="submit"
            className="rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            {props.submitLabel}
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
  );
}
