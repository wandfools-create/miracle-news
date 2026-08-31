#!/usr/bin/env tsx
/**
 * Read-only local smoke: fetch /ko and /en, collect internal article links, GET each.
 * Does not print env vars. Skips gracefully when server is unavailable.
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const BASE = process.env.HOME_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const MAX_LINKS = 40;

type SmokeResult = {
  pagesChecked: string[];
  linksChecked: number;
  unexpected404: Array<{ url: string; from: string }>;
  skipped: boolean;
  reason?: string;
};

function extractArticleLinks(html: string, page: string): string[] {
  const hrefRe = /href="(\/(?:ko|en)\/article\/[^"#?]+)"/g;
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(html)) !== null) {
    out.add(match[1]!);
  }
  return [...out].slice(0, MAX_LINKS);
}

async function fetchStatus(url: string): Promise<number> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return res.status;
  } catch {
    return 0;
  }
}

async function serverAlive(): Promise<boolean> {
  const status = await fetchStatus(`${BASE}/ko`);
  return status > 0 && status < 500;
}

export async function runHomeLinkSmoke(): Promise<SmokeResult> {
  const alive = await serverAlive();
  if (!alive) {
    return {
      pagesChecked: [],
      linksChecked: 0,
      unexpected404: [],
      skipped: true,
      reason: `Server not reachable at ${BASE}`,
    };
  }

  const pages = [`${BASE}/ko`, `${BASE}/en`];
  const unexpected404: Array<{ url: string; from: string }> = [];
  let linksChecked = 0;

  for (const page of pages) {
    const res = await fetch(page);
    const html = await res.text();
    const links = extractArticleLinks(html, page);
    for (const path of links) {
      linksChecked += 1;
      const url = `${BASE}${path}`;
      const status = await fetchStatus(url);
      if (status === 404) {
        unexpected404.push({ url, from: page });
      }
    }
  }

  return {
    pagesChecked: pages,
    linksChecked,
    unexpected404,
    skipped: false,
  };
}

async function main() {
  const result = await runHomeLinkSmoke();
  if (result.skipped) {
    console.log(`[homeLinkSmoke] SKIPPED: ${result.reason}`);
    process.exit(0);
  }
  console.log(
    `[homeLinkSmoke] pages=${result.pagesChecked.length} links=${result.linksChecked} unexpected404=${result.unexpected404.length}`
  );
  for (const item of result.unexpected404) {
    console.log(`  404 ${item.url} (from ${item.from})`);
  }
  process.exit(result.unexpected404.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
