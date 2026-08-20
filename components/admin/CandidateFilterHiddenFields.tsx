type Props = {
  status: string;
  source: string;
  date: string;
};

export default function CandidateFilterHiddenFields({
  status,
  source,
  date,
}: Props) {
  return (
    <>
      <input type="hidden" name="statusFilter" value={status} />
      <input type="hidden" name="sourceFilter" value={source} />
      <input type="hidden" name="dateFilter" value={date} />
    </>
  );
}
