import { shortlistCollectionCandidateAction } from "@/app/admin/(app)/collection-candidates/shortlistCandidateAction";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";

type Props = {
  candidateId: string;
  view?: string;
  status: string;
  source: string;
  date: string;
  category?: string;
  advanced?: boolean;
  compact?: boolean;
  emphasize?: boolean;
};

export default function ShortlistCandidateForm({
  candidateId,
  view = "ai",
  status,
  source,
  date,
  category = "all",
  advanced = false,
  compact = false,
  emphasize = false,
}: Props) {
  return (
    <form action={shortlistCollectionCandidateAction} className="inline-flex">
      <input type="hidden" name="candidateId" value={candidateId} />
      <CandidateFilterHiddenFields
        view={view}
        status={status}
        source={source}
        date={date}
        category={category}
        advanced={advanced}
      />
      <button
        type="submit"
        className={
          emphasize
            ? compact
              ? "rounded-md border border-violet-400 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-950 hover:bg-violet-100"
              : "rounded-lg border border-violet-400 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-950 hover:bg-violet-100"
            : compact
              ? "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
              : "rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
        }
      >
        편집 보관함에 담기
      </button>
    </form>
  );
}
