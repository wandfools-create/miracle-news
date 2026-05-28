import type { TrendingIssue, TrendingIssuesBlock } from "@/lib/home/types";

export type TrendingIssuesLabels = {
  title: string;
  regionUs: string;
  regionKr: string;
};

type TrendingIssuesPanelProps = {
  block: TrendingIssuesBlock;
  labels: TrendingIssuesLabels;
};

function IssueRow({ issue }: { issue: TrendingIssue }) {
  return (
    <li className="border-b border-neutral-200/80 py-2.5 last:border-b-0 last:pb-0">
      <p className="text-[13px] font-semibold leading-snug text-neutral-950">
        {issue.title}
      </p>
      {issue.description ? (
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
          {issue.description}
        </p>
      ) : null}
    </li>
  );
}

function RegionList({
  title,
  issues,
  accentClass,
}: {
  title: string;
  issues: TrendingIssue[];
  accentClass: string;
}) {
  if (issues.length === 0) return null;

  return (
    <div className="mt-3 first:mt-0">
      <p
        className={`border-l-2 pl-2 text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500 ${accentClass} border-solid`}
      >
        {title}
      </p>
      <ul className="mt-2 space-y-0">
        {issues.map((issue) => (
          <IssueRow key={issue.id} issue={issue} />
        ))}
      </ul>
    </div>
  );
}

export default function TrendingIssuesPanel({
  block,
  labels,
}: TrendingIssuesPanelProps) {
  return (
    <section
      className="rounded-lg border border-neutral-200 bg-white px-4 py-3.5 shadow-sm"
      aria-labelledby="trending-issues-heading"
    >
      <h2
        id="trending-issues-heading"
        className="text-sm font-bold text-news-navy"
      >
        {labels.title}
      </h2>
      <RegionList
        title={labels.regionUs}
        issues={block.us}
        accentClass="border-l-blue-800"
      />
      <RegionList
        title={labels.regionKr}
        issues={block.kr}
        accentClass="border-l-news-red"
      />
    </section>
  );
}
