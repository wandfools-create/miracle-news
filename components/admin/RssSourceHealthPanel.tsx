import { buildRssSourceHealthRows } from "@/lib/rss/rssSourceHealth";

/** Config-only RSS feed status (no live fetch, no OpenAI). */
export default function RssSourceHealthPanel() {
  const rows = buildRssSourceHealthRows();

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
      <p className="text-xs font-semibold tracking-wide text-gray-500">
        RSS 수집망 · 설정 상태
      </p>
      <p className="mt-1 text-[11px] text-gray-500">
        코드 기준 활성/비활성입니다. 72시간 DB 지표는 추후 연결 예정 · 자동 삭제 없음.
      </p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <li
            key={row.sourceKey}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-900">
                {row.label}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  row.status === "비활성"
                    ? "bg-neutral-200 text-neutral-700"
                    : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {row.status}
              </span>
            </div>
            {row.note ? (
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-gray-500">
                {row.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
