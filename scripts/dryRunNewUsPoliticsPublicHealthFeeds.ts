/**
 * Read-only dry-run for newly added US politics / public-health feeds.
 * No DB writes, no OpenAI, no cron. Fetch + parse + field prefilter only.
 *
 *   npx tsx scripts/dryRunNewUsPoliticsPublicHealthFeeds.ts
 */
import {
  buildDefaultCollectionFieldProfile,
  evaluateCollectionFieldProfile,
  shouldAutoExcludeFieldDecision,
} from "../lib/editorial-rules/evaluateCollectionFieldProfile";
import { parseRssFeed } from "../lib/rss/parseRssFeed";
import { RSS_MAX_INSERTS_PER_FEED } from "../lib/rss/rssItemFreshness";

const NEW_FEEDS = [
  {
    sourceKey: "nyt",
    label: "NYT Politics",
    feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
  },
  {
    sourceKey: "nyt",
    label: "NYT World",
    feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  },
  {
    sourceKey: "wapo",
    label: "WaPo Politics",
    feedUrl: "https://feeds.washingtonpost.com/rss/politics",
  },
  {
    sourceKey: "wapo",
    label: "WaPo World",
    feedUrl: "https://feeds.washingtonpost.com/rss/world",
  },
  {
    sourceKey: "the-hill",
    label: "The Hill",
    feedUrl: "https://thehill.com/news/feed/",
  },
  {
    sourceKey: "npr",
    label: "NPR Politics",
    feedUrl: "https://feeds.npr.org/1014/rss.xml",
  },
  {
    sourceKey: "npr",
    label: "NPR World",
    feedUrl: "https://feeds.npr.org/1004/rss.xml",
  },
  {
    sourceKey: "pbs-newshour",
    label: "PBS World",
    feedUrl: "https://www.pbs.org/newshour/feeds/rss/world",
  },
  {
    sourceKey: "cdc",
    label: "CDC Newsroom",
    feedUrl: "https://tools.cdc.gov/api/v2/resources/media/132608.rss",
  },
  {
    sourceKey: "cdc",
    label: "CDC Outbreaks",
    feedUrl: "https://tools.cdc.gov/api/v2/resources/media/285676.rss",
  },
  {
    sourceKey: "who",
    label: "WHO News",
    feedUrl: "https://www.who.int/rss-feeds/news-english.xml",
  },
] as const;

async function main() {
  const profile = buildDefaultCollectionFieldProfile(true);
  const seenUrls = new Set<string>();
  let received = 0;
  let duplicate = 0;
  let excluded = 0;
  let wouldInsert = 0;
  const perFeed: Array<Record<string, string | number>> = [];

  for (const feed of NEW_FEEDS) {
    const parsed = await parseRssFeed(feed.feedUrl);
    if (!parsed.ok) {
      perFeed.push({
        feed: feed.label,
        error: parsed.error,
        received: 0,
        duplicate: 0,
        excluded: 0,
        passCap: 0,
      });
      continue;
    }

    let feedDup = 0;
    let feedExcl = 0;
    let feedPass = 0;
    received += parsed.items.length;

    for (const item of parsed.items) {
      const url = item.link.trim();
      if (!url) continue;
      if (seenUrls.has(url)) {
        duplicate += 1;
        feedDup += 1;
        continue;
      }
      seenUrls.add(url);

      const decision = evaluateCollectionFieldProfile(
        {
          title: item.title,
          summary: item.summary,
          categories: item.categories,
          collectRegion: "us-intl",
        },
        profile
      );
      if (shouldAutoExcludeFieldDecision(decision)) {
        excluded += 1;
        feedExcl += 1;
        continue;
      }
      if (feedPass >= RSS_MAX_INSERTS_PER_FEED) continue;
      feedPass += 1;
      wouldInsert += 1;
    }

    perFeed.push({
      feed: feed.label,
      received: parsed.items.length,
      duplicate: feedDup,
      excluded: feedExcl,
      passCap: feedPass,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: "read-only-dry-run",
        openaiCalls: 0,
        dbWrites: 0,
        perFeedMaxInserts: RSS_MAX_INSERTS_PER_FEED,
        totals: {
          received,
          uniqueUrls: seenUrls.size,
          duplicate,
          excluded,
          wouldEnterCandidateCap: wouldInsert,
        },
        perFeed,
        unsupportedOfficialRss: [
          "Politico (403 Cloudflare)",
          "White House /feed (404)",
          "State Dept press RSS (403)",
          "CDC MMWR xml (403)",
          "WHO Disease Outbreak News legacy RSS (404)",
          "Reuters Agency best-topics feed (404)",
        ],
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
