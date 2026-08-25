/** Google news-sitemap XML parse for Yonhap KR radar (no network, no OpenAI). */

export type YonhapSitemapEntry = {
  loc: string;
  title: string;
  publishedAt: string | null;
};

/** Parse Google news-sitemap XML (fixture-friendly). */
export function parseYonhapNewsSitemapXml(xml: string): YonhapSitemapEntry[] {
  const entries: YonhapSitemapEntry[] = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) ?? [];

  for (const block of blocks) {
    const loc =
      block.match(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/i)?.[1]?.trim() ??
      null;
    if (!loc || !/yna\.co\.kr\/view\/AKR/i.test(loc)) continue;

    const titleCdata =
      block.match(
        /<news:title>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/news:title>/i
      )?.[1] ?? null;
    const titlePlain =
      block.match(/<news:title>\s*([^<]+?)\s*<\/news:title>/i)?.[1] ?? null;
    const title = (titleCdata ?? titlePlain ?? "").trim();
    if (!title) continue;

    const pubRaw =
      block
        .match(/<news:publication_date>\s*([^<]+?)\s*<\/news:publication_date>/i)?.[1]
        ?.trim() ?? null;
    let publishedAt: string | null = null;
    if (pubRaw) {
      const t = new Date(pubRaw).getTime();
      if (Number.isFinite(t)) publishedAt = new Date(t).toISOString();
    }

    entries.push({
      loc: loc.split("?")[0],
      title,
      publishedAt,
    });
  }

  return entries;
}
