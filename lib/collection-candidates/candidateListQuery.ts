export const CANDIDATE_SOURCE_FILTERS = [
  { key: "all", label: "전체 출처" },
  { key: "ap", label: "AP" },
  { key: "fox-news", label: "Fox" },
  { key: "pbs-newshour", label: "PBS" },
  { key: "csm", label: "CSM" },
] as const;

export const CANDIDATE_DATE_FILTERS = [
  { key: "all", label: "전체 날짜" },
  { key: "today", label: "오늘" },
  { key: "3d", label: "최근 3일" },
  { key: "7d", label: "최근 7일" },
] as const;

export type CandidateListQuery = {
  status: string;
  source: string;
  date: string;
};

export function parseCandidateListQuery(input: {
  status?: string;
  source?: string;
  date?: string;
}): CandidateListQuery {
  const sourceKeys = new Set<string>(
    CANDIDATE_SOURCE_FILTERS.map((s) => s.key).filter((k) => k !== "all")
  );
  const dateKeys = new Set<string>(CANDIDATE_DATE_FILTERS.map((d) => d.key));

  const source = input.source?.trim() || "all";
  const date = input.date?.trim() || "all";

  return {
    status: input.status?.trim() || "actionable",
    source: sourceKeys.has(source) || source === "all" ? source : "all",
    date: dateKeys.has(date) ? date : "all",
  };
}

export function candidateListSearchParams(query: CandidateListQuery): string {
  const params = new URLSearchParams();
  if (query.status && query.status !== "actionable") {
    params.set("status", query.status);
  } else {
    params.set("status", query.status || "actionable");
  }
  if (query.source && query.source !== "all") {
    params.set("source", query.source);
  }
  if (query.date && query.date !== "all") {
    params.set("date", query.date);
  }
  return params.toString();
}

export function dateFilterRange(dateKey: string): { from: string } | null {
  if (dateKey === "all") return null;

  const now = new Date();
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);

  if (dateKey === "today") {
    return { from: from.toISOString() };
  }
  if (dateKey === "3d") {
    from.setUTCDate(from.getUTCDate() - 2);
    return { from: from.toISOString() };
  }
  if (dateKey === "7d") {
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: from.toISOString() };
  }
  return null;
}

export function shortenCandidateFailure(error: string | null, maxLen = 140): string | null {
  if (!error?.trim()) return null;
  const compact = error.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 1)}…`;
}
