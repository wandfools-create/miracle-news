import { dismissCollectionCandidateAction } from "@/app/admin/(app)/collection-candidates/actions";
import CandidateFilterHiddenFields from "@/components/admin/CandidateFilterHiddenFields";

type Props = {
  candidateId: string;
  status: string;
  source: string;
  date: string;
};

export default function DismissCandidateForm({
  candidateId,
  status,
  source,
  date,
}: Props) {
  return (
    <form action={dismissCollectionCandidateAction} className="inline-flex">
      <input type="hidden" name="candidateId" value={candidateId} />
      <CandidateFilterHiddenFields status={status} source={source} date={date} />
      <button
        type="submit"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        제외
      </button>
    </form>
  );
}
