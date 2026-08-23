type Props = {
  status: string;
  source: string;
  date: string;
  category?: string;
  advanced?: boolean;
};

export default function CandidateFilterHiddenFields({
  status,
  source,
  date,
  category = "all",
  advanced = false,
}: Props) {
  return (
    <>
      <input type="hidden" name="statusFilter" value={status} />
      <input type="hidden" name="sourceFilter" value={source} />
      <input type="hidden" name="dateFilter" value={date} />
      <input type="hidden" name="categoryFilter" value={category} />
      {advanced ? <input type="hidden" name="advanced" value="1" /> : null}
    </>
  );
}
