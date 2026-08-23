import "server-only";

import { supabase } from "@/lib/supabase";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";

export type PublishedQuickRange = "all" | "today" | "yesterday" | "last7";

export type PublishedAdminListQuery = {
  page: number;
  q: string;
  date: string;
  range: PublishedQuickRange;
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dayBoundsUtc(dateKey: string): { gte: string; lt: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const gte = `${dateKey}T00:00:00.000Z`;
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return { gte, lt: d.toISOString() };
}

function quickRangeBounds(range: PublishedQuickRange): {
  gte: string;
  lt?: string;
} | null {
  if (range === "all") return null;
  const now = new Date();
  const todayKey = toDateKey(now);
  if (range === "today") {
    const b = dayBoundsUtc(todayKey);
    return b;
  }
  if (range === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return dayBoundsUtc(toDateKey(y));
  }
  // last7: today inclusive back 6 days
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return { gte: start.toISOString() };
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
}

export function parsePublishedAdminListQuery(input: {
  page?: string | null;
  q?: string | null;
  date?: string | null;
  range?: string | null;
}): PublishedAdminListQuery {
  const rangeRaw = String(input.range ?? "all").trim();
  const range: PublishedQuickRange =
    rangeRaw === "today" ||
    rangeRaw === "yesterday" ||
    rangeRaw === "last7" ||
    rangeRaw === "all"
      ? rangeRaw
      : "all";
  return {
    page: parseAdminListPage(input.page),
    q: String(input.q ?? "").trim(),
    date: String(input.date ?? "").trim(),
    range,
  };
}

const PUBLISHED_SELECT = `
  id,
  source,
  original_url,
  title_original,
  title_translated,
  title_ko,
  summary_original,
  summary_translated,
  summary_ko,
  category,
  status,
  review_status,
  thumbnail_url,
  published_at,
  created_at,
  is_published,
  is_top_story,
  top_story_order,
  editorial_priority
`;

export type PublishedAdminRow = {
  id: string;
  source: string;
  original_url: string | null;
  title_original: string | null;
  title_translated: string | null;
  title_ko: string | null;
  summary_original: string | null;
  summary_translated: string | null;
  summary_ko: string | null;
  category: string | null;
  status: string | null;
  review_status: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  created_at: string;
  is_published: boolean | null;
  is_top_story: boolean | null;
  top_story_order: number | null;
  editorial_priority: string | null;
};

export async function fetchPublishedAdminList(
  query: PublishedAdminListQuery
): Promise<{
  articles: PublishedAdminRow[];
  totalCount: number;
  error: string | null;
  pageSize: number;
}> {
  const pageSize = ADMIN_LIST_PAGE_SIZE;
  const { from, to } = adminListRange(query.page, pageSize);

  let db = supabase
    .from("articles")
    .select(PUBLISHED_SELECT, { count: "exact" })
    .eq("is_published", true)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (query.q) {
    const term = escapeIlike(query.q);
    if (term) {
      const pattern = `"%${term.replace(/"/g, "")}%"`;
      db = db.or(
        [
          `title_ko.ilike.${pattern}`,
          `title_original.ilike.${pattern}`,
          `title_translated.ilike.${pattern}`,
          `source.ilike.${pattern}`,
          `original_url.ilike.${pattern}`,
          `category.ilike.${pattern}`,
        ].join(",")
      );
    }
  }

  if (query.date) {
    const bounds = dayBoundsUtc(query.date);
    if (bounds) {
      db = db.gte("published_at", bounds.gte).lt("published_at", bounds.lt);
    }
  } else {
    const bounds = quickRangeBounds(query.range);
    if (bounds) {
      db = db.gte("published_at", bounds.gte);
      if (bounds.lt) db = db.lt("published_at", bounds.lt);
    }
  }

  const { data, error, count } = await db.range(from, to);

  if (error) {
    return {
      articles: [],
      totalCount: 0,
      error: error.message,
      pageSize,
    };
  }

  return {
    articles: (data ?? []) as PublishedAdminRow[],
    totalCount: count ?? 0,
    error: null,
    pageSize,
  };
}
