import "server-only";

import type { ParsedRssItem } from "@/lib/rss/parseRssFeed";

/** AP News public GraphQL (replaces defunct feeds.apnews.com RSS). */
const AP_GRAPHQL_ENDPOINT = "https://apnews.com/graphql/delivery/ap/v1";
const AP_PERSISTED_QUERY_HASH =
  "3bc305abbf62e9e632403a74cc86dc1cba51156d2313f09b3779efec51fc3acb";

type ApPagePromo = {
  __typename?: string;
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  publishDateStamp?: number;
};

export type FetchApNewsFeedResult =
  | { ok: true; items: ParsedRssItem[] }
  | { ok: false; error: string };

function buildApGraphqlUrl(categoryPath: string): string {
  const params = new URLSearchParams({
    operationName: "ContentPageQuery",
    variables: JSON.stringify({ path: categoryPath }),
    extensions: JSON.stringify({
      persistedQuery: {
        version: 1,
        sha256Hash: AP_PERSISTED_QUERY_HASH,
      },
    }),
  });
  return `${AP_GRAPHQL_ENDPOINT}?${params.toString()}`;
}

function extractPromos(screen: {
  main?: Array<{
    __typename?: string;
    columns?: Array<{
      __typename?: string;
      items?: ApPagePromo[];
    }>;
  }>;
}): ApPagePromo[] {
  const promos: ApPagePromo[] = [];
  const seen = new Set<string>();

  for (const container of screen.main ?? []) {
    if (container.__typename !== "ColumnContainer") continue;
    for (const column of container.columns ?? []) {
      if (column.__typename !== "PageListModule") continue;
      for (const promo of column.items ?? []) {
        if (promo.__typename !== "PagePromo") continue;
        const id = promo.id?.trim();
        const url = promo.url?.trim();
        const title = promo.title?.trim();
        if (!id || !url || !title) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        promos.push(promo);
      }
    }
  }

  promos.sort(
    (a, b) => (b.publishDateStamp ?? 0) - (a.publishDateStamp ?? 0)
  );

  return promos;
}

export async function fetchApNewsFeedItems(input: {
  categoryPath?: string;
  limit?: number;
}): Promise<FetchApNewsFeedResult> {
  const categoryPath = input.categoryPath?.trim() || "/";
  const limit = input.limit ?? 25;
  const url = buildApGraphqlUrl(categoryPath);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "HannoonNewsBot/1.0 (+rss-collect; ap-graphql)",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `AP GraphQL HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      data?: { Screen?: Parameters<typeof extractPromos>[0] | null };
      errors?: Array<{ message?: string }>;
    };

    if (data.errors?.length) {
      return {
        ok: false,
        error: data.errors.map((e) => e.message).filter(Boolean).join("; ") || "AP GraphQL error",
      };
    }

    if (!data.data?.Screen) {
      return { ok: false, error: "AP GraphQL: Screen data missing" };
    }

    const promos = extractPromos(data.data.Screen).slice(0, limit);
    const items: ParsedRssItem[] = promos.map((promo) => ({
      title: promo.title!.trim(),
      link: promo.url!.trim(),
      publishedAt:
        promo.publishDateStamp != null
          ? new Date(promo.publishDateStamp).toISOString()
          : null,
      summary: promo.description?.trim() || null,
      guid: promo.id!.trim(),
    }));

    return { ok: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
