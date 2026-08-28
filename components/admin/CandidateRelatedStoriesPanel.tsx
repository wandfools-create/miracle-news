import Link from "next/link";
import type { RelatedStoryRef } from "@/lib/same-event/relatedStories";
import { formatDateTimeKo } from "@/lib/articleWorkflow";

const SOURCE_LABELS: Record<string, string> = {
  ap: "AP",
  "fox-news": "Fox",
  "pbs-newshour": "PBS",
  csm: "CSM",
  yonhap: "Yonhap",
  "yonhap-kr-radar": "연합뉴스 속보",
  "korea-herald": "Korea Herald",
  bbc: "BBC",
  chosun: "조선일보",
  tvchosun: "TV조선",
  insight: "인사이트",
};

type Props = {
  related: RelatedStoryRef[];
  poolCapped?: boolean;
};

export default function CandidateRelatedStoriesPanel({
  related,
  poolCapped = false,
}: Props) {
  if (related.length === 0 && !poolCapped) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800">
      <p className="font-semibold text-slate-700">관련 기사</p>
      {poolCapped ? (
        <p className="mt-0.5 text-[11px] text-slate-600">
          최근 관련 기사 일부만 비교됨 (14일·상위 400건)
        </p>
      ) : null}
      {related.length === 0 ? (
        <p className="mt-1 text-[11px] text-slate-600">표시할 관련 기사 없음</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {related.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="leading-snug">
              <span
                className={`mr-1.5 inline-block rounded px-1.5 py-0.5 font-medium ${
                  r.relation === "same_event"
                    ? "bg-amber-100 text-amber-900"
                    : r.relation === "update"
                      ? "bg-sky-100 text-sky-900"
                      : r.relation === "different_angle"
                        ? "bg-violet-100 text-violet-900"
                        : "bg-gray-200 text-gray-800"
                }`}
              >
                {r.relationLabel}
              </span>
              {r.href ? (
                <Link href={r.href} className="font-medium underline">
                  {r.title}
                </Link>
              ) : (
                <span className="font-medium">{r.title}</span>
              )}
              <span className="text-slate-600">
                {" "}
                · {SOURCE_LABELS[r.source] || r.source}
                {r.publishedAt ? ` · ${formatDateTimeKo(r.publishedAt)}` : ""}
                {" · "}
                {r.statusLabel}
              </span>
              {r.diffNote ? (
                <span className="block text-slate-600">차이: {r.diffNote}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
