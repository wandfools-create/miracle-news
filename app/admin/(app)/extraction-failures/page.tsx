import Link from "next/link";
import { fetchRecentExtractionFailures } from "@/lib/extraction/logExtractionAttempt";
import {
  EXTRACTION_FAILURE_LABELS,
  normalizeExtractionFailureCode,
} from "@/lib/extraction/failureTaxonomy";
import { formatDateTimeKo } from "@/lib/articleWorkflow";

export const dynamic = "force-dynamic";

export default async function ExtractionFailuresAdminPage() {
  const { rows, error } = await fetchRecentExtractionFailures(80);

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold text-gray-500">관리자 / 추출 실패</p>
        <h1 className="mt-2 text-2xl font-bold">본문 추출 실패 분석</h1>
        <p className="mt-2 text-sm text-gray-600">
          유료벽·봇 차단 우회 없이 실패 원인만 기록합니다. 본문 전체는 저장하지 않습니다.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            DB 조회 실패 (migration 미적용 가능): {error}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-gray-500">최근 실패 기록이 없습니다.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((row) => {
              const code = normalizeExtractionFailureCode(row.failure_code);
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {EXTRACTION_FAILURE_LABELS[code]}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDateTimeKo(row.last_attempt_at)}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-gray-700">{row.url}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    출처 {row.source ?? "—"} · HTTP {row.http_status ?? "—"} · 글자{" "}
                    {row.extracted_length ?? 0} · 방식 {row.extraction_method ?? "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/admin/from-link?url=${encodeURIComponent(row.url)}`}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    >
                      본문 직접 붙여넣기
                    </Link>
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    >
                      다른 출처 찾기
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
