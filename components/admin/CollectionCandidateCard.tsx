import {
  CANDIDATE_STATUS_LABELS,
  type CollectionCandidateStatus,
} from "@/lib/collection-candidates/types";
import { formatDateTimeKo } from "@/lib/articleWorkflow";
import { shortenCandidateFailure } from "@/lib/collection-candidates/candidateListQuery";
import DismissCandidateForm from "@/components/admin/DismissCandidateForm";
import EnrichCandidateForm from "@/components/admin/EnrichCandidateForm";

const SOURCE_LABELS: Record<string, string> = {
  ap: "AP",
  "fox-news": "Fox",
  "pbs-newshour": "PBS",
  csm: "CSM",
};

type CollectionCandidateCardProps = {
  id: string;
  source: string;
  feedLabel: string | null;
  rssTitle: string;
  rssSummary: string | null;
  rssTitleKo: string | null;
  rssSummaryKo: string | null;
  originalUrl: string;
  rssPublishedAt: string | null;
  status: CollectionCandidateStatus;
  enrichError: string | null;
  enrichStep: string | null;
  articleId: string | null;
  createdAt: string;
  statusFilter: string;
  sourceFilter: string;
  dateFilter: string;
};

export default function CollectionCandidateCard({
  id,
  source,
  feedLabel,
  rssTitle,
  rssSummary,
  rssTitleKo,
  rssSummaryKo,
  originalUrl,
  rssPublishedAt,
  status,
  enrichError,
  enrichStep,
  articleId,
  createdAt,
  statusFilter,
  sourceFilter,
  dateFilter,
}: CollectionCandidateCardProps) {
  const sourceLabel = feedLabel || SOURCE_LABELS[source] || source;
  const statusLabel = CANDIDATE_STATUS_LABELS[status] ?? status;
  const localized = Boolean(rssTitleKo?.trim());
  const canMakeArticle =
    status === "pending" || status === "enrich_failed" || status === "enriching";
  const canDismiss =
    status === "pending" ||
    status === "enrich_failed" ||
    status === "enriching" ||
    status === "selected";
  const failureText = shortenCandidateFailure(enrichError);

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            name="candidateIds"
            value={id}
            form="localize-candidates-form"
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
            aria-label="한글화 대상으로 선택"
          />
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
            {sourceLabel}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              status === "pending"
                ? "bg-blue-50 text-blue-800"
                : status === "enrich_failed"
                  ? "bg-red-50 text-red-800"
                  : status === "enriched"
                    ? "bg-green-50 text-green-800"
                    : status === "enriching"
                      ? "bg-amber-50 text-amber-800"
                      : status === "dismissed"
                        ? "bg-gray-200 text-gray-700"
                        : "bg-gray-100 text-gray-700"
            }`}
          >
            {statusLabel}
          </span>
          {localized ? (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
              한글화 완료
            </span>
          ) : null}
        </div>
        <time className="text-xs text-gray-500" dateTime={createdAt}>
          수집 {formatDateTimeKo(createdAt)}
        </time>
      </div>

      {localized ? (
        <>
          <h2 className="mt-3 text-lg font-semibold leading-snug text-gray-900">
            {rssTitleKo!.trim()}
          </h2>
          {rssSummaryKo?.trim() ? (
            <p className="mt-2 text-sm leading-6 text-gray-700">
              {rssSummaryKo.trim()}
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-5 text-gray-500">{rssTitle}</p>
          {rssSummary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">
              {rssSummary}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <h2 className="mt-3 text-lg font-semibold leading-snug text-gray-900">
            {rssTitle}
          </h2>
          {rssSummary ? (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
              {rssSummary}
            </p>
          ) : null}
        </>
      )}

      {rssPublishedAt ? (
        <p className="mt-2 text-xs text-gray-500">
          RSS 발행: {formatDateTimeKo(rssPublishedAt)}
        </p>
      ) : null}

      {status === "enrich_failed" && failureText ? (
        <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
          {enrichStep ? `${enrichStep}: ` : ""}
          {failureText}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start gap-2">
        <a
          href={originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          원문 열기
        </a>
        {canMakeArticle ? (
          <EnrichCandidateForm
            candidateId={id}
            status={statusFilter}
            source={sourceFilter}
            date={dateFilter}
            retry={status === "enrich_failed" || status === "enriching"}
          />
        ) : null}
        {status === "enriched" && articleId ? (
          <a
            href={`/admin/review/${articleId}`}
            className="inline-flex items-center rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-900 hover:bg-green-100"
          >
            검토 대기에서 보기
          </a>
        ) : null}
        {canDismiss ? (
          <DismissCandidateForm
            candidateId={id}
            status={statusFilter}
            source={sourceFilter}
            date={dateFilter}
          />
        ) : null}
      </div>
    </article>
  );
}
