import "server-only";

import {
  createCollectionRun,
  finishCollectionRun,
  resolveCollectionTriggerType,
  type CollectionRunTriggerType,
} from "@/lib/collection-candidates/collectionRuns";
import {
  findCollectionCandidateByUrl,
  insertCollectionCandidate,
} from "@/lib/collection-candidates/insertCollectionCandidate";
import { findExistingArticleByOriginalUrl } from "@/lib/articles/findExistingArticleByOriginalUrl";
import { resolveSubmittedUrl } from "@/lib/from-link/resolveSubmittedUrl";
import { fetchApNewsFeedItems } from "@/lib/rss/fetchApNewsFeed";
import { fetchJoongangLatestItems } from "@/lib/rss/fetchJoongangLatest";
import {
  fetchInsightSectionListItems,
  insightSectionFromFeedUrl,
} from "@/lib/rss/fetchInsightSectionList";
import { fetchYonhapKrRadarItems } from "@/lib/rss/fetchYonhapKrRadar";
import { logRssCollectItemSkipped } from "@/lib/rss/logRssCollectFailure";
import {
  formatRssItemSkipReason,
  getRssItemSkipReason,
} from "@/lib/rss/rssItemPrefilter";
import { findVerySimilarTitle } from "@/lib/rss/rssTitleSimilarity";
import {
  decideCollectSameEvent,
  loadRecentCandidatesForSameEvent,
  type SameEventCandidateRow,
} from "@/lib/same-event/sameEventLookback";
import type { StoryDoc } from "@/lib/same-event/classifySameEvent";
import {
  emptyRssCollectCostStats,
  formatRssCollectCostNote,
  resolveCollectRssOptions,
  type CollectRssOptions,
  type RssCollectCostStats,
} from "@/lib/rss/rssCollectConfig";
import {
  getActiveRssFeedSources,
  RSS_FEED_SOURCES,
  type RssFeedSource,
} from "@/lib/rss/feedSources";
import {
  evaluateRssItemAge,
  RSS_FIRST_PASS_INSERTS_PER_FEED,
  RSS_MAX_INSERTS_PER_FEED,
  RSS_MAX_ITEMS_PER_FEED,
  rssFeedInsertQuota,
} from "@/lib/rss/rssItemFreshness";
import { parseRssFeed, type ParsedRssItem } from "@/lib/rss/parseRssFeed";
import {
  YONHAP_KR_RADAR_MAX_INSERTS_PER_RUN,
  YONHAP_KR_RADAR_SOURCE_KEY,
} from "@/lib/rss/yonhapKrRadarPolicy";
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
  skippedOld: number;
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
  region: CollectRssOptions["region"];
  costs: RssCollectCostStats;
  feeds: FeedCollectStats[];
  totals: {
    checked: number;
    inserted: number;
    wouldInsert: number;
    duplicates: number;
    skipped: number;
    skippedOld: number;
    failed: number;
  };
};

type CollectRunContext = {
  options: CollectRssOptions;
  costs: RssCollectCostStats;
  remainingCandidateBudget: { value: number };
  recordDbWrite: () => void;
  seenTitles: string[];
  recentSameEventCandidates: SameEventCandidateRow[];
  collectionRunId: string | null;
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
        ? `rss collect v5 candidates: ${stats.error} · ${costNote}`
        : [
            "rss collect v5 candidates",
            `inserted=${stats.inserted}`,
            `would_add=${stats.wouldInsert ?? 0}`,
            `duplicate=${stats.duplicates}`,
            `skipped_old=${stats.skippedOld}`,
            `skipped=${stats.skipped}`,
            `failed=${stats.failed}`,
            costNote,
          ].join(" · "),
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
      note: [
        "rss collect v5 candidates run",
        `inserted=${totals.inserted}`,
        `duplicate=${totals.duplicates}`,
        `skipped_old=${totals.skippedOld}`,
        `skipped=${totals.skipped}`,
        costNote,
      ].join(" · "),
    });
    ctx.recordDbWrite();
  } catch (err) {
    console.error("[collectRss] run collection_logs failed", err);
  }
}

type ProcessOutcome =
  | "duplicate"
  | "skipped"
  | "skipped_old"
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

  const age = evaluateRssItemAge(item.publishedAt);
  if (age.action === "skip_old") {
    console.info("[collectRss] skip old item", {
      source: feed.sourceKey,
      link,
      publishedAt: item.publishedAt,
      ageMs: age.ageMs,
    });
    return "skipped_old";
  }
  if (age.reason === "unknown_published_at") {
    console.info("[collectRss] unknown publishedAt — allowing", {
      source: feed.sourceKey,
      link,
      title: item.title.slice(0, 120),
    });
  }

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

  const incomingDoc: StoryDoc = {
    title: item.title,
    summary: item.summary ?? null,
    source: feed.sourceKey,
    publishedAt: item.publishedAt,
    hasThumbnail: Boolean(item.thumbnailUrl?.trim()),
  };
  const sameEvent = decideCollectSameEvent(
    incomingDoc,
    ctx.recentSameEventCandidates
  );
  if (sameEvent.action === "suppress") {
    await logRssCollectItemSkipped({
      sourceLabel: feed.label,
      originalUrl: link,
      rssTitle: item.title,
      reason: `same_event: suppressed vs ${sameEvent.existingSource} "${sameEvent.existingTitle.slice(0, 80)}" (${sameEvent.reason})`,
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

  const categoryFromItem =
    item.categories.find((c) =>
      ["politics", "economy", "society", "world"].includes(c)
    ) ?? null;

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
    thumbnailUrl: item.thumbnailUrl,
    category: feed.category ?? categoryFromItem,
    collectionRunId: ctx.collectionRunId,
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
  ctx.recentSameEventCandidates.unshift({
    id: result.candidateId,
    source: feed.sourceKey,
    rss_title: item.title,
    title: item.title,
    summary: item.summary ?? null,
    publishedAt: item.publishedAt,
    hasThumbnail: Boolean(item.thumbnailUrl?.trim()),
  });

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
      limit: RSS_MAX_ITEMS_PER_FEED,
    });
    if (!ap.ok) {
      return { ok: false, error: ap.error };
    }
    return { ok: true, items: ap.items };
  }

  if (feed.fetchKind === "yna-sitemap-radar") {
    const radar = await fetchYonhapKrRadarItems();
    if (!radar.ok) {
      return { ok: false, error: radar.error };
    }
    return { ok: true, items: radar.items };
  }

  if (feed.fetchKind === "joongang-news-sitemap") {
    const joongang = await fetchJoongangLatestItems({
      sitemapUrl: feed.feedUrl,
    });
    if (!joongang.ok) {
      return { ok: false, error: joongang.error };
    }
    return { ok: true, items: joongang.items };
  }

  if (feed.fetchKind === "insight-section-list") {
    const section = insightSectionFromFeedUrl(feed.feedUrl);
    if (!section) {
      return { ok: false, error: "insight_unknown_section" };
    }
    const insight = await fetchInsightSectionListItems({
      section,
      listUrl: feed.feedUrl,
      limit: RSS_MAX_ITEMS_PER_FEED,
    });
    if (!insight.ok) {
      return { ok: false, error: insight.error };
    }
    return { ok: true, items: insight.items };
  }

  const parsed = await parseRssFeed(feed.feedUrl);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  return { ok: true, items: parsed.items };
}

function publisherMaxInserts(feed: RssFeedSource): number {
  if (feed.sourceKey === YONHAP_KR_RADAR_SOURCE_KEY) {
    return (
      feed.maxInsertsPerRun ?? YONHAP_KR_RADAR_MAX_INSERTS_PER_RUN
    );
  }
  return feed.maxInsertsPerRun ?? RSS_MAX_INSERTS_PER_FEED;
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
      summary: item.summary,
      categories: item.categories,
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

type PreparedFeed = {
  feed: RssFeedSource;
  stats: FeedCollectStats;
  /** Remaining prefiltered items to try (shared across fair passes). */
  queue: ParsedRssItem[];
};

function emptyFeedStats(feed: RssFeedSource): FeedCollectStats {
  return {
    sourceKey: feed.sourceKey,
    label: feed.label,
    feedUrl: feed.feedUrl,
    checked: 0,
    inserted: 0,
    wouldInsert: 0,
    duplicates: 0,
    skipped: 0,
    skippedOld: 0,
    failed: 0,
  };
}

/** Fetch + prefilter one feed. Parse/fetch errors stay on this feed; run continues. */
async function prepareFeed(
  feed: RssFeedSource,
  ctx: CollectRunContext
): Promise<PreparedFeed> {
  const stats = emptyFeedStats(feed);
  const fetched = await fetchFeedItems(feed);
  if (!fetched.ok) {
    stats.error = fetched.error;
    console.warn("[collectRss] feed failed (continuing other feeds)", {
      source: feed.sourceKey,
      error: fetched.error,
    });
    return { feed, stats, queue: [] };
  }

  const items = fetched.items.slice(0, RSS_MAX_ITEMS_PER_FEED);
  stats.checked = items.length;

  const { toProcess, skipped: prefilterSkipped } = await prefilterRssFeedItems(
    feed,
    items,
    ctx
  );
  stats.skipped += prefilterSkipped;

  return { feed, stats, queue: [...toProcess] };
}

/**
 * Process up to `maxNewInserts` successful saves from this feed's queue.
 * Does not exceed per-publisher cap or run budget (checked via caller quota).
 */
async function drainFeedInsertQuota(
  prepared: PreparedFeed,
  seenUrls: Set<string>,
  ctx: CollectRunContext,
  maxNewInserts: number
): Promise<void> {
  if (maxNewInserts <= 0) return;

  let savedThisCall = 0;
  while (
    savedThisCall < maxNewInserts &&
    prepared.queue.length > 0 &&
    (!ctx.options.save || ctx.remainingCandidateBudget.value > 0)
  ) {
    const item = prepared.queue.shift()!;
    const outcome = await processRssItem(prepared.feed, item, seenUrls, ctx);

    if (outcome === "duplicate") {
      prepared.stats.duplicates += 1;
      continue;
    }
    if (outcome === "skipped_old") {
      prepared.stats.skippedOld += 1;
      continue;
    }
    if (
      outcome === "skipped" ||
      (typeof outcome === "object" && outcome.kind === "prefilter_skipped")
    ) {
      prepared.stats.skipped += 1;
      continue;
    }
    if (outcome === "insert_failed") {
      prepared.stats.failed += 1;
      continue;
    }
    if (typeof outcome === "object" && outcome.kind === "would_insert") {
      prepared.stats.wouldInsert = (prepared.stats.wouldInsert ?? 0) + 1;
      savedThisCall += 1;
      continue;
    }

    prepared.stats.inserted += 1;
    savedThisCall += 1;
    ctx.remainingCandidateBudget.value -= 1;
  }
}

function feedSavedCount(stats: FeedCollectStats): number {
  return stats.inserted + (stats.wouldInsert ?? 0);
}

/** Sum inserts across all category feeds for one publisher (sourceKey). */
function publisherSavedCount(
  prepared: PreparedFeed[],
  sourceKey: string
): number {
  let total = 0;
  for (const p of prepared) {
    if (p.feed.sourceKey === sourceKey) {
      total += feedSavedCount(p.stats);
    }
  }
  return total;
}

function uniqueMainPublisherKeys(mainPrepared: PreparedFeed[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const p of mainPrepared) {
    if (seen.has(p.feed.sourceKey)) continue;
    seen.add(p.feed.sourceKey);
    keys.push(p.feed.sourceKey);
  }
  return keys;
}

function publisherFeeds(
  prepared: PreparedFeed[],
  sourceKey: string
): PreparedFeed[] {
  return prepared.filter((p) => p.feed.sourceKey === sourceKey);
}

/** Category feeds with queue left — least saved first (stable tie = registration order). */
function rotateCategoryFeeds(feeds: PreparedFeed[]): PreparedFeed[] {
  return feeds
    .filter((p) => p.queue.length > 0)
    .sort((a, b) => feedSavedCount(a.stats) - feedSavedCount(b.stats));
}

/**
 * Drain up to maxNewInserts for one publisher, rotating category feeds by
 * least saved count so politics does not monopolize 조선/TV조선/인사이트.
 */
async function drainPublisherWithCategoryRotation(
  prepared: PreparedFeed[],
  sourceKey: string,
  seenUrls: Set<string>,
  ctx: CollectRunContext,
  maxNewInserts: number
): Promise<number> {
  if (maxNewInserts <= 0) return 0;

  const feeds = publisherFeeds(prepared, sourceKey);
  let saved = 0;
  let stagnantRounds = 0;

  while (saved < maxNewInserts) {
    if (ctx.options.save && ctx.remainingCandidateBudget.value <= 0) break;

    const candidates = rotateCategoryFeeds(feeds);
    if (candidates.length === 0) break;

    let roundProgress = false;
    for (const p of candidates) {
      if (saved >= maxNewInserts) break;
      if (ctx.options.save && ctx.remainingCandidateBudget.value <= 0) break;

      const before = feedSavedCount(p.stats);
      await drainFeedInsertQuota(p, seenUrls, ctx, 1);
      const after = feedSavedCount(p.stats);
      if (after > before) {
        saved += after - before;
        roundProgress = true;
        stagnantRounds = 0;
      }
    }

    if (!roundProgress) {
      stagnantRounds += 1;
      if (stagnantRounds >= 2) break;
    }
  }

  return saved;
}

async function drainMainPublishersFair(
  prepared: PreparedFeed[],
  mainPrepared: PreparedFeed[],
  seenUrls: Set<string>,
  ctx: CollectRunContext,
  pass: 0 | 1 | 2
): Promise<void> {
  const publisherKeys = uniqueMainPublisherKeys(mainPrepared);

  if (pass === 0) {
    for (const sourceKey of publisherKeys) {
      if (ctx.options.save && ctx.remainingCandidateBudget.value <= 0) break;
      if (publisherSavedCount(prepared, sourceKey) > 0) continue;
      await drainPublisherWithCategoryRotation(
        prepared,
        sourceKey,
        seenUrls,
        ctx,
        1
      );
    }
    return;
  }

  for (const sourceKey of publisherKeys) {
    if (ctx.options.save && ctx.remainingCandidateBudget.value <= 0) break;
    const quota = rssFeedInsertQuota({
      pass,
      alreadyInserted: publisherSavedCount(prepared, sourceKey),
      runBudgetRemaining: ctx.options.save
        ? ctx.remainingCandidateBudget.value
        : Number.MAX_SAFE_INTEGER,
      maxInserts: publisherMaxInserts(
        publisherFeeds(prepared, sourceKey)[0]!.feed
      ),
    });
    await drainPublisherWithCategoryRotation(
      prepared,
      sourceKey,
      seenUrls,
      ctx,
      quota
    );
  }
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
  const recentSameEventCandidates = await loadRecentCandidatesForSameEvent();

  // Fail-open: if collection_runs migration is missing, runId stays null.
  let collectionRunId: string | null = null;
  if (options.save && !options.testMode && options.region) {
    const triggerType: CollectionRunTriggerType =
      options.triggerType ?? resolveCollectionTriggerType(null);
    collectionRunId = await createCollectionRun({
      region: options.region,
      triggerType,
    });
  }

  const ctx: CollectRunContext = {
    options,
    costs,
    remainingCandidateBudget,
    recordDbWrite,
    seenTitles,
    recentSameEventCandidates,
    collectionRunId,
  };

  if (!options.save) {
    console.info(
      "[collectRss] dry-run — feeds + prefilter only. Set RSS_COLLECT_SAVE=1 to insert collection_candidates. OpenAI is never called here."
    );
  } else if (options.testMode) {
    console.info("[collectRss] test mode — no DB writes");
  }

  const activeFeeds = getActiveRssFeedSources(options.region);
  const mainFeeds = activeFeeds.filter(
    (f) => f.sourceKey !== YONHAP_KR_RADAR_SOURCE_KEY
  );
  const radarFeeds = activeFeeds.filter(
    (f) => f.sourceKey === YONHAP_KR_RADAR_SOURCE_KEY
  );

  console.info("[collectRss] run start (v6 candidates, publisher seed + category rotation, no OpenAI)", {
    mode: options.mode,
    save: options.save,
    region: options.region,
    collectionRunId,
    maxCandidatesPerRun: options.maxCandidatesPerRun,
    maxInsertsPerFeed: RSS_MAX_INSERTS_PER_FEED,
    firstPassInsertsPerFeed: RSS_FIRST_PASS_INSERTS_PER_FEED,
    yonhapKrRadarMax: YONHAP_KR_RADAR_MAX_INSERTS_PER_RUN,
    openaiCalls: 0,
    feedCount: activeFeeds.length,
    registeredFeedCount: RSS_FEED_SOURCES.length,
  });

  let hardFailed = false;
  let errorSummary: string | null = null;

  try {
  // 1) Prepare every active feed (fetch failures isolated per source).
  //    Main publishers first; Yonhap KR radar last so it does not crowd pass-1.
  const prepared: PreparedFeed[] = [];
  for (const feed of [...mainFeeds, ...radarFeeds]) {
    prepared.push(await prepareFeed(feed, ctx));
  }

  const mainPrepared = prepared.filter(
    (p) => p.feed.sourceKey !== YONHAP_KR_RADAR_SOURCE_KEY
  );
  const radarPrepared = prepared.filter(
    (p) => p.feed.sourceKey === YONHAP_KR_RADAR_SOURCE_KEY
  );

  // 2) Publisher seed — each main publisher gets 1 insert opportunity before
  //    any publisher accumulates a second (eligible queue only; no forced save).
  await drainMainPublishersFair(prepared, mainPrepared, seenUrls, ctx, 0);

  // 3) Fair pass 1 — up to FIRST_PASS inserts per publisher with category rotation.
  await drainMainPublishersFair(prepared, mainPrepared, seenUrls, ctx, 1);

  // 4) Fair pass 2 — leftover run budget for main publishers (cap 4 combined).
  await drainMainPublishersFair(prepared, mainPrepared, seenUrls, ctx, 2);

  // 5) Yonhap KR radar — small auxiliary cap (≤3), only after main quotas.
  for (const p of radarPrepared) {
    if (ctx.options.save && ctx.remainingCandidateBudget.value <= 0) break;
    const quota = rssFeedInsertQuota({
      pass: 2,
      alreadyInserted: publisherSavedCount(prepared, p.feed.sourceKey),
      runBudgetRemaining: ctx.options.save
        ? ctx.remainingCandidateBudget.value
        : Number.MAX_SAFE_INTEGER,
      maxInserts: publisherMaxInserts(p.feed),
    });
    await drainFeedInsertQuota(p, seenUrls, ctx, quota);
  }

  const feeds: FeedCollectStats[] = [];
  for (const p of prepared) {
    await logFeedCollection(p.feed.label, p.stats, ctx);
    feeds.push(p.stats);
  }

  const totals = feeds.reduce(
    (acc, f) => ({
      checked: acc.checked + f.checked,
      inserted: acc.inserted + f.inserted,
      wouldInsert: acc.wouldInsert + (f.wouldInsert ?? 0),
      duplicates: acc.duplicates + f.duplicates,
      skipped: acc.skipped + f.skipped,
      skippedOld: acc.skippedOld + f.skippedOld,
      failed: acc.failed + f.failed,
    }),
    {
      checked: 0,
      inserted: 0,
      wouldInsert: 0,
      duplicates: 0,
      skipped: 0,
      skippedOld: 0,
      failed: 0,
    }
  );

  await logRunCollection(totals, ctx);

  if (collectionRunId) {
    await finishCollectionRun({
      runId: collectionRunId,
      collectedCount: totals.checked,
      newCandidateCount: totals.inserted,
      duplicateCount: totals.duplicates,
      failedCount: totals.failed,
      hardFailed,
      errorSummary,
    });
  }

  console.info("[collectRss] run done", { totals, costs, collectionRunId });

  return {
    ok: feeds.every(
      (f) => !f.error || f.inserted > 0 || (f.wouldInsert ?? 0) > 0
    ),
    mode: options.mode,
    save: options.save,
    testMode: options.testMode,
    dryRun: !options.save,
    maxCandidatesPerRun: options.maxCandidatesPerRun,
    region: options.region,
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
  } catch (err) {
    hardFailed = true;
    errorSummary =
      err instanceof Error ? err.message : String(err);
    if (collectionRunId) {
      await finishCollectionRun({
        runId: collectionRunId,
        collectedCount: 0,
        newCandidateCount: costs.candidatesAdded,
        duplicateCount: 0,
        failedCount: 1,
        hardFailed: true,
        errorSummary,
      });
    }
    throw err;
  }
}
