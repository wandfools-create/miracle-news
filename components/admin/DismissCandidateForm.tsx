import { dismissCollectionCandidateAction } from "@/app/admin/(app)/collection-candidates/dismissCandidateAction";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";

type Props = {
  candidateId: string;
  status: string;
  source: string;
  date: string;
  category?: string;
  view?: string;
  advanced?: boolean;
  compact?: boolean;
};

export default function DismissCandidateForm({
  candidateId,
  status,
  source,
  date,
  category = "all",
  view = "ai",
  advanced = false,
  compact = false,
}: Props) {
  return (
    <form action={dismissCollectionCandidateAction} className="inline-flex">
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
          compact
            ? "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            : "rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        }
      >
        제외
      </button>
    </form>
  );
}
