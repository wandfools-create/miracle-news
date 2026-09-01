"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CollectionRunSummary } from "@/lib/collection-candidates/groupCandidatesByRun";
import {
  collectionRunRegionLabel,
  collectionRunStatusLabel,
  formatCollectionRunTimeEt,
} from "@/lib/collection-candidates/groupCandidatesByRun";

type Props = {
  runs: CollectionRunSummary[];
  activeRunKey: string | null;
  regionFilter: "all" | "korea" | "us-intl";
  showPendingOnly: boolean;
  /** When true, expand the latest run section (default). */
  expandLatest?: boolean;
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
  regionFilter,
  showPendingOnly,
  expandLatest = true,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [latest, ...older] = runs;

  return (
    <section
      aria-label="수집 회차"
      className="mb-4 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-gray-600">
          수집 회차
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref(pathname, searchParams, {
              run: null,
              runRegion: null,
              pendingOnly: null,
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              !activeRunKey && regionFilter === "all" && !showPendingOnly
                ? "border-black bg-black text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            전체 보기
          </Link>
          {latest ? (
            <Link
              href={buildHref(pathname, searchParams, {
                run: latest.runKey,
                runRegion: null,
              })}
              className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
                activeRunKey === latest.runKey
                  ? "border-violet-800 bg-violet-800 text-white"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              최신 회차
            </Link>
          ) : null}
          <Link
            href={buildHref(pathname, searchParams, {
              runRegion: "korea",
              run: null,
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              regionFilter === "korea"
                ? "border-sky-700 bg-sky-700 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            한국
          </Link>
          <Link
            href={buildHref(pathname, searchParams, {
              runRegion: "us-intl",
              run: null,
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              regionFilter === "us-intl"
                ? "border-sky-700 bg-sky-700 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            미국·국제
          </Link>
          <Link
            href={buildHref(pathname, searchParams, {
              pendingOnly: showPendingOnly ? null : "1",
            })}
            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[0.98] ${
              showPendingOnly
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            미확인만
          </Link>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        시각은 미국 동부시간(America/New_York, DST 반영)입니다.
      </p>

      {latest && expandLatest ? (
        <RunRow
          run={latest}
          active={activeRunKey === latest.runKey}
          href={buildHref(pathname, searchParams, { run: latest.runKey })}
          defaultOpen
        />
      ) : !latest ? (
        <p className="mt-2 text-xs text-gray-500">표시할 회차가 없습니다.</p>
      ) : null}

      {older.length > 0 ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none rounded-md px-1 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black [&::-webkit-details-marker]:hidden">
            <span className="underline-offset-2 group-open:underline">
              이전 회차 {older.length}건 (기본 접힘)
            </span>
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
  defaultOpen = false,
}: {
  run: CollectionRunSummary;
  active: boolean;
  href: string;
  defaultOpen?: boolean;
}) {
  const progress =
    run.total > 0 ? Math.round((run.processed / run.total) * 100) : 0;
  const kindLabel = run.kind === "real" ? "실제 회차" : "추정 회차";

  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      data-open={defaultOpen ? "1" : undefined}
      className={`mt-2 block cursor-pointer rounded-lg border px-3 py-2.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 active:scale-[0.995] ${
        active
          ? "border-black bg-neutral-900 text-white shadow-sm"
          : "border-gray-200 bg-gray-50 text-gray-800 hover:border-gray-300 hover:bg-gray-100"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          {formatCollectionRunTimeEt(run.startedAt)}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              active
                ? "bg-white/20 text-white"
                : run.kind === "real"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-900"
            }`}
          >
            {kindLabel}
          </span>
          <span>{collectionRunRegionLabel(run.region)}</span>
        </span>
      </div>
      {run.finishedAt ? (
        <p className={`mt-1 ${active ? "opacity-90" : "text-gray-600"}`}>
          종료 {formatCollectionRunTimeEt(run.finishedAt)}
        </p>
      ) : null}
      <p className="mt-1 opacity-90">
        수집 {run.collectedCount} · 신규 {run.newCandidates} · 미확인{" "}
        {run.pending} · 기사화 {run.articleized} · 제외 {run.dismissed} · 실패{" "}
        {run.failed}
        {run.discordNotified != null
          ? ` · Discord ${run.discordNotified}`
          : ""}
      </p>
      <p className="mt-1">
        진행 {progress}% · {collectionRunStatusLabel(run.status)}
      </p>
    </Link>
  );
}
