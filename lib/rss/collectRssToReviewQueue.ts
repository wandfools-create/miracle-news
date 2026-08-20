import "server-only";

import {
  findCollectionCandidateByUrl,
  insertCollectionCandidate,
} from "@/lib/collection-candidates/insertCollectionCandidate";
import { findExistingArticleByOriginalUrl } from "@/lib/articles/findExistingArticleByOriginalUrl";
import { resolveSubmittedUrl } from "@/lib/from-link/resolveSubmittedUrl";
import { fetchApNewsFeedItems } from "@/lib/rss/fetchApNewsFeed";
import { logRssCollectItemSkipped } from "@/lib/rss/logRssCollectFailure";
import {
  formatRssItemSkipReason,
  getRssItemSkipReason,
} from "@/lib/rss/rssItemPrefilter";
import { findVerySimilarTitle } from "@/lib/rss/rssTitleSimilarity";
import {
  emptyRssCollectCostStats,
  formatRssCollectCostNote,
  resolveCollectRssOptions,
  type CollectRssOptions,
  type RssCollectCostStats,
} from "@/lib/rss/rssCollectConfig";
import { RSS_FEED_SOURCES, type RssFeedSource } from "@/lib/rss/feedSources";
import { parseRssFeed, type ParsedRssItem } from "@/lib/rss/parseRssFeed";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type FeedCollectStats = {
  sourceKey: string;
  label: string;
  feedUrl: string;
  checked: number;
  inserted: number;
  wouldInsert?: number;
  duplicates: number;
  skipped: number;
  failed: number;
  error?: string;
};

export type CollectRssResult = {
  ok: boolean;
  mode: CollectRssOptions["mode"];
  save: boolean;
  testMode: boolean;
  dryRun: boolean;
  maxCandidatesPerRun: number;
  costs: RssCollectCostStats;
  feeds: FeedCollectStats[];
  totals: {
    checked: number;
    inserted: number;
    wouldInsert: number;
    duplicates: number;
    skipped: number;
    failed: number;
  };
};

const MAX_ITEMS_PER_FEED = 25;

type CollectRunContext = {
  options: CollectRssOptions;
  costs: RssCollectCostStats;
  remainingCandidateBudget: { value: number };
  recordDbWrite: () => void;
  seenTitles: string[];
};

async function loadRecentCandidateTitles(): Promise<string[]> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return [];

  try {
    const { client } = createServiceRoleSupabaseClient();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 14);
    const { data, error } = await client
      .from("collection_candidates")
      .select("rss_title")
      .gte("created_at", since.toISOString())
      .limit(400);

    if (error) {
      console.warn("[collectRss] loadRecentCandidateTitles failed", error);
      return [];
    }

    return (data ?? [])
      .map((row) => String((row as { rss_title?: string }).rss_title ?? "").trim())
      .filter(Boolean);
  } catch (err) {
    console.warn("[collectRss] loadRecentCandidateTitles threw", err);
    return [];
  }
}

function rssCustomUniqueId(sourceKey: string, link: string, guid: string | null) {
  if (guid && guid.length < 500) {
    return `rss:${sourceKey}:${guid}`;
  }
  return `rss:${sourceKey}:${link}`;
}

async function logFeedCollection(
  source: string,
  stats: Omit<FeedCollectStats, "sourceKey" | "label" | "feedUrl">,
  ctx: CollectRunContext
) {
  if (!ctx.options.persistLogs) return;

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return;

  try {
    const { client } = createServiceRoleSupabaseClient();
    const status =
      stats.error && stats.inserted === 0
        ? "failed"
        : stats.failed > 0
          ? "partial"
          : "success";

    const costNote = formatRssCollectCostNote(ctx.costs, {
      mode: ctx.options.mode,
      feed: source,
    });

    await client.from("collection_logs").insert({
      source,
      checked_count: stats.checked,
      saved_count: stats.inserted,
      duplicate_count: stats.duplicates,
      failed_count: stats.failed,
      status,
      note: stats.error
        ? `rss collect v4 candidates: ${stats.error} · ${costNote}`
        : `rss collect v4 candidates · added ${stats.inserted} · would_add ${stats.wouldInsert ?? 0} · skipped ${stats.skipped} · ${costNote}`,
    });
    ctx.recordDbWrite();
  } catch (err) {
    console.error("[collectRss] collection_logs failed", err);
  }
}

async function logRunCollection(
  totals: CollectRssResult["totals"],
  ctx: CollectRunContext
) {
  if (!ctx.options.persistLogs) return;

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) return;

  try {
    const { client } = createServiceRoleSupabaseClient();
    const costNote = formatRssCollectCostNote(ctx.costs, {
      mode: ctx.options.mode,
      scope: "run",
    });

    await client.from("collection_logs").insert({
      source: "RSS collect (run)",
      checked_count: totals.checked,
      saved_count: totals.inserted,
      duplicate_count: totals.duplicates,
      failed_count: totals.failed,
      status: totals.failed > 0 ? "partial" : "success",
      note: `rss collect v4 candidates run · ${costNote}`,
    });
    ctx.recordDbWrite();
  } catch (err) {
    console.error("[collectRss] run collection_logs failed", err);
  }
}

type ProcessOutcome =
  | "duplicate"
  | "skipped"
  | { kind: "prefilter_skipped"; reason: string }
  | { kind: "would_insert" }
  | "insert_failed"
  | { kind: "saved"; candidateId: string };

async function processRssItem(
  feed: RssFeedSource,
  item: ParsedRssItem,
  seenUrls: Set<string>,
  ctx: CollectRunContext
): Promise<ProcessOutcome> {
  const resolved = resolveSubmittedUrl(item.link);
  if (!resolved.ok) return "skipped";

  const link = resolved.href;

  if (seenUrls.has(link)) return "duplicate";
  seenUrls.add(link);

  const existingArticle = await findExistingArticleByOriginalUrl(link);
  if (!existingArticle.ok) {
    console.error("[collectRss] duplicate check failed", existingArticle.error);
    return "insert_failed";
  }
  if (existingArticle.articleId) return "duplicate";

  const existingCandidate = await findCollectionCandidateByUrl({
    source: feed.sourceKey,
    originalUrl: link,
  });
  if (!existingCandidate.ok) {
    console.error("[collectRss] candidate duplicate check failed", existingCandidate.error);
    return "insert_failed";
  }
  if (existingCandidate.candidateId) return "duplicate";

  const similar = findVerySimilarTitle(item.title, ctx.seenTitles);
  if (similar) {
    await logRssCollectItemSkipped({
      sourceLabel: feed.label,
      originalUrl: link,
      rssTitle: item.title,
      reason: `similar_title: same-event duplicate of "${similar.slice(0, 120)}"`,
      persistLogs: false,
    });
    return "duplicate";
  }

  ctx.seenTitles.push(item.title);

  if (!ctx.options.save) {
    return { kind: "would_insert" };
  }

  if (ctx.options.testMode) {
    ctx.costs.candidatesAdded += 1;
    return { kind: "would_insert" };
  }

  const result = await insertCollectionCandidate({
    source: feed.sourceKey,
    sourceCountry: feed.sourceCountry,
    feedLabel: feed.label,
    originalUrl: link,
    rssTitle: item.title,
    rssSummary: item.summary,
    rssPublishedAt: item.publishedAt,
    rssGuid: item.guid,
    customUniqueId: rssCustomUniqueId(feed.sourceKey, link, item.guid),
  });

  if (!result.ok) {
    if (result.duplicateCandidateId || result.step === "duplicate") {
      return "duplicate";
    }
    console.error("[collectRss] candidate insert failed", {
      source: feed.sourceKey,
      link,
      error: result.error,
      step: result.step,
    });
    return "insert_failed";
  }

  ctx.costs.candidatesAdded += 1;
  ctx.recordDbWrite();

  console.info("[collectRss] candidate saved", {
    candidateId: result.candidateId,
    source: feed.sourceKey,
    link,
  });

  return { kind: "saved", candidateId: result.candidateId };
}

async function fetchFeedItems(
  feed: RssFeedSource
): Promise<{ ok: true; items: ParsedRssItem[] } | { ok: false; error: string }> {
  if (feed.fetchKind === "ap-graphql") {
    const ap = await fetchApNewsFeedItems({
      categoryPath: feed.apCategoryPath ?? "/",
      limit: MAX_ITEMS_PER_FEED,
    });
    if (!ap.ok) {
      return { ok: false, error: ap.error };
    }
    return { ok: true, items: ap.items };
  }

  const parsed = await parseRssFeed(feed.feedUrl);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  return { ok: true, items: parsed.items };
}

async function prefilterRssFeedItems(
  feed: RssFeedSource,
  items: ParsedRssItem[],
  ctx: CollectRunContext
): Promise<{ toProcess: ParsedRssItem[]; skipped: number }> {
  const toProcess: ParsedRssItem[] = [];
  let skipped = 0;

  for (const item of items) {
    const resolved = resolveSubmittedUrl(item.link);
    if (!resolved.ok) {
      skipped += 1;
      continue;
    }

    const skipReason = getRssItemSkipReason(feed.sourceKey, {
      title: item.title,
      url: resolved.href,
    });
    if (skipReason) {
      skipped += 1;
      await logRssCollectItemSkipped({
        sourceLabel: feed.label,
        originalUrl: resolved.href,
        rssTitle: item.title,
        reason: formatRssItemSkipReason(skipReason),
        persistLogs: false,
      });
      continue;
    }

    toProcess.push(item);
  }

  return { toProcess, skipped };
}

async function collectSingleFeed(
  feed: RssFeedSource,
  seenUrls: Set<string>,
  ctx: CollectRunContext
): Promise<FeedCollectStats> {
  const stats: FeedCollectStats = {
    sourceKey: feed.sourceKey,
    label: feed.label,
    feedUrl: feed.feedUrl,
    checked: 0,
    inserted: 0,
    wouldInsert: 0,
    duplicates: 0,
    skipped: 0,
    failed: 0,
  };

  const fetched = await fetchFeedItems(feed);
  if (!fetched.ok) {
    stats.error = fetched.error;
    await logFeedCollection(feed.label, stats, ctx);
    return stats;
  }

  const items = fetched.items.slice(0, MAX_ITEMS_PER_FEED);
  stats.checked = items.length;

  const { toProcess, skipped: prefilterSkipped } = await prefilterRssFeedItems(
    feed,
    items,
    ctx
  );
  stats.skipped += prefilterSkipped;

  for (const item of toProcess) {
    if (ctx.options.save && ctx.remainingCandidateBudget.value <= 0) break;

    const outcome = await processRssItem(feed, item, seenUrls, ctx);

    if (outcome === "duplicate") {
      stats.duplicates += 1;
      continue;
    }
    if (
      outcome === "skipped" ||
      (typeof outcome === "object" && outcome.kind === "prefilter_skipped")
    ) {
      stats.skipped += 1;
      continue;
    }
    if (outcome === "insert_failed") {
      stats.failed += 1;
      continue;
    }
    if (typeof outcome === "object" && outcome.kind === "would_insert") {
      stats.wouldInsert = (stats.wouldInsert ?? 0) + 1;
      continue;
    }

    stats.inserted += 1;
    ctx.remainingCandidateBudget.value -= 1;
  }

  await logFeedCollection(feed.label, stats, ctx);
  return stats;
}

export async function collectRssToReviewQueue(
  optionsInput?: CollectRssOptions
): Promise<CollectRssResult> {
  const options = optionsInput ?? resolveCollectRssOptions(null);
  const costs = emptyRssCollectCostStats();
  const recordDbWrite = () => {
    costs.dbWrites += 1;
  };

  const remainingCandidateBudget = {
    value: options.save ? options.maxCandidatesPerRun : Number.MAX_SAFE_INTEGER,
  };

  const seenUrls = new Set<string>();
  const seenTitles = await loadRecentCandidateTitles();
  const feeds: FeedCollectStats[] = [];

  const ctx: CollectRunContext = {
    options,
    costs,
    remainingCandidateBudget,
    recordDbWrite,
    seenTitles,
  };

  if (!options.save) {
    console.info(
      "[collectRss] dry-run — feeds + prefilter only. Set RSS_COLLECT_SAVE=1 to insert collection_candidates. OpenAI is never called here."
    );
  } else if (options.testMode) {
    console.info("[collectRss] test mode — no DB writes");
  }

  console.info("[collectRss] run start (v4 candidates, no OpenAI)", {
    mode: options.mode,
    save: options.save,
    maxCandidatesPerRun: options.maxCandidatesPerRun,
    openaiCalls: 0,
  });

  for (const feed of RSS_FEED_SOURCES) {
    const stats = await collectSingleFeed(feed, seenUrls, ctx);
    feeds.push(stats);
  }

  const totals = feeds.reduce(
    (acc, f) => ({
      checked: acc.checked + f.checked,
      inserted: acc.inserted + f.inserted,
      wouldInsert: acc.wouldInsert + (f.wouldInsert ?? 0),
      duplicates: acc.duplicates + f.duplicates,
      skipped: acc.skipped + f.skipped,
      failed: acc.failed + f.failed,
    }),
    {
      checked: 0,
      inserted: 0,
      wouldInsert: 0,
      duplicates: 0,
      skipped: 0,
      failed: 0,
    }
  );

  await logRunCollection(totals, ctx);

  console.info("[collectRss] run done", { totals, costs });

  return {
    ok: feeds.every(
      (f) => !f.error || f.inserted > 0 || (f.wouldInsert ?? 0) > 0
    ),
    mode: options.mode,
    save: options.save,
    testMode: options.testMode,
    dryRun: !options.save,
    maxCandidatesPerRun: options.maxCandidatesPerRun,
    costs: {
      ...costs,
      enrichAttempts: 0,
      enrichSucceeded: 0,
      articlesSaved: 0,
      aiThumbnailsGenerated: 0,
    },
    feeds,
    totals,
  };
}
