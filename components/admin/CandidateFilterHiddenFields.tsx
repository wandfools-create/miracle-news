type Props = {
  view?: string;
  status: string;
  source: string;
  date: string;
  category?: string;
  advanced?: boolean;
  run?: string | null;
  runRegion?: string | null;
  pendingOnly?: boolean;
};

export default function CandidateFilterHiddenFields({
  view = "ai",
  status,
  source,
  date,
  category = "all",
  advanced = false,
  run = null,
  runRegion = null,
  pendingOnly = false,
}: Props) {
  return (
    <>
      <input type="hidden" name="viewFilter" value={view} />
      <input type="hidden" name="statusFilter" value={status} />
      <input type="hidden" name="sourceFilter" value={source} />
      <input type="hidden" name="dateFilter" value={date} />
      <input type="hidden" name="categoryFilter" value={category} />
      <input type="hidden" name="scrollY" defaultValue="0" />
      {advanced ? <input type="hidden" name="advanced" value="1" /> : null}
      {run ? <input type="hidden" name="run" value={run} /> : null}
      {runRegion ? (
        <input type="hidden" name="runRegion" value={runRegion} />
      ) : null}
      {pendingOnly ? (
        <input type="hidden" name="pendingOnly" value="1" />
      ) : null}
    </>
  );
}
