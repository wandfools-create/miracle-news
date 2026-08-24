import {
  parseCandidateCategoryFilter,
  type CandidateCategoryFilterKey,
} from "@/lib/collection-candidates/candidateCategory";

export const CANDIDATE_VIEW_FILTERS = [
  { key: "ai", label: "AI 추천" },
  { key: "recent", label: "전체" },
  { key: "older", label: "이전 후보" },
] as const;

export type CandidateViewKey = (typeof CANDIDATE_VIEW_FILTERS)[number]["key"];

export const CANDIDATE_SOURCE_FILTERS = [
  { key: "all", label: "전체 출처" },
  { key: "ap", label: "AP" },
  { key: "fox-news", label: "Fox" },
  { key: "pbs-newshour", label: "PBS" },
  { key: "csm", label: "CSM" },
  { key: "yonhap", label: "Yonhap" },
  { key: "korea-herald", label: "Korea Herald" },
  { key: "bbc", label: "BBC" },
  { key: "sciencedaily", label: "ScienceDaily" },
] as const;

export const CANDIDATE_DATE_FILTERS = [
  { key: "all", label: "전체 날짜" },
  { key: "today", label: "오늘" },
  { key: "3d", label: "최근 3일" },
  { key: "7d", label: "최근 7일" },
] as const;

export type CandidateListQuery = {
  /** Primary desk view: AI recommend / recent 48h / older pending. */
  view: CandidateViewKey;
  status: string;
  source: string;
  date: string;
  category: CandidateCategoryFilterKey;
};

export function parseCandidateView(raw: string | null | undefined): CandidateViewKey {
  const value = raw?.trim() || "ai";
  if (value === "recent" || value === "older" || value === "ai") return value;
  return "ai";
}

export function parseCandidateListQuery(input: {
  view?: string;
  status?: string;
  source?: string;
  date?: string;
  category?: string;
}): CandidateListQuery {
  const sourceKeys = new Set<string>(
    CANDIDATE_SOURCE_FILTERS.map((s) => s.key).filter((k) => k !== "all")
  );
  const dateKeys = new Set<string>(CANDIDATE_DATE_FILTERS.map((d) => d.key));

  const source = input.source?.trim() || "all";
  const date = input.date?.trim() || "all";
  const view = parseCandidateView(input.view);

  let status = input.status?.trim() || "";
  if (!status) {
    if (view === "older" || view === "recent") status = "pending";
    else status = "actionable";
  }

  return {
    view,
    status,
    source: sourceKeys.has(source) || source === "all" ? source : "all",
    date: dateKeys.has(date) ? date : "all",
    category: parseCandidateCategoryFilter(input.category),
  };
}

export function candidateListSearchParams(query: CandidateListQuery): string {
  const params = new URLSearchParams();
  if (query.view && query.view !== "ai") {
    params.set("view", query.view);
  }
  const defaultStatus =
    query.view === "older"
      ? "pending"
      : query.view === "recent"
        ? "pending"
        : "actionable";
  if (query.status && query.status !== defaultStatus) {
    params.set("status", query.status);
  }
  if (query.source && query.source !== "all") {
    params.set("source", query.source);
  }
  if (query.date && query.date !== "all") {
    params.set("date", query.date);
  }
  if (query.category && query.category !== "all") {
    params.set("category", query.category);
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
