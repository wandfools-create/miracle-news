"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CollectionRunSummary } from "@/lib/collection-candidates/groupCandidatesByRun";
import { formatDateTimeKo } from "@/lib/articleWorkflow";

type Props = {
  runs: CollectionRunSummary[];
  activeRunKey: string | null;
  showPendingOnly: boolean;
};

function buildHref(
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | null>
) {
  const next = new URLSearchParams(params.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export default function CollectionRunPanel({
  runs,
  activeRunKey,
  showPendingOnly,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [latest, ...older] = runs;

  return (
    <section
      aria-label="수집 회차"
      className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-gray-600">
          수집 회차
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildHref(pathname, searchParams, { run: null })}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              !activeRunKey
                ? "bg-black text-white"
                : "border border-gray-300 text-gray-700"
            }`}
          >
            전체 보기
          </Link>
          <Link
            href={buildHref(pathname, searchParams, {
              pendingOnly: showPendingOnly ? null : "1",
            })}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              showPendingOnly
                ? "bg-sky-700 text-white"
                : "border border-gray-300 text-gray-700"
            }`}
          >
            미확인만
          </Link>
        </div>
      </div>

      {latest ? (
        <RunRow
          run={latest}
          active={activeRunKey === latest.runKey}
          href={buildHref(pathname, searchParams, { run: latest.runKey })}
        />
      ) : (
        <p className="mt-2 text-xs text-gray-500">표시할 회차가 없습니다.</p>
      )}

      {older.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-gray-500">
            이전 회차 {older.length}건 접기/펼치기
          </summary>
          <ul className="mt-2 space-y-2">
            {older.map((run) => (
              <li key={run.runKey}>
                <RunRow
                  run={run}
                  active={activeRunKey === run.runKey}
                  href={buildHref(pathname, searchParams, { run: run.runKey })}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function RunRow({
  run,
  active,
  href,
}: {
  run: CollectionRunSummary;
  active: boolean;
  href: string;
}) {
  const progress =
    run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;

  return (
    <Link
      href={href}
      className={`mt-2 block rounded-lg border px-3 py-2 text-xs transition ${
        active
          ? "border-black bg-neutral-900 text-white"
          : "border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
      }`}
      aria-current={active ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{formatDateTimeKo(run.startedAt)}</span>
        <span>{run.region ?? "—"}</span>
      </div>
      <p className="mt-1 opacity-90">
        신규 {run.newCandidates} · 미확인 {run.pending} · 기사화 {run.articleized}{" "}
        · 제외 {run.dismissed} · 실패 {run.failed}
      </p>
      <p className="mt-1">
        진행 {progress}% · {run.status === "failed" ? "실패" : run.status === "partial" ? "일부 실패" : "성공"}
      </p>
    </Link>
  );
}
