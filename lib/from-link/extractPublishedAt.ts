/** Normalize meta / JSON-LD date strings to ISO 8601 for Postgres timestamptz. */
export function normalizePublishedAtToIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;

  return new Date(ms).toISOString();
}

function readMetaByProperty(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${prop}["'][^>]*>`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function readTimeDatetime(html: string): string | null {
  const patterns = [
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i,
    /<time[^>]+pubdate[^>]+datetime=["']([^"']+)["'][^>]*>/i,
    /<time[^>]+class=["'][^"']*published[^"']*["'][^>]+datetime=["']([^"']+)["'][^>]*>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function extractFromJsonLd(html: string): string | null {
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const json: unknown = JSON.parse(raw);
      const found = findDatePublishedInJsonLd(json);
      if (found) return found;
    } catch {
      /* ignore invalid JSON-LD blocks */
    }
  }
  return null;
}

function findDatePublishedInJsonLd(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const d = findDatePublishedInJsonLd(item);
      if (d) return d;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const o = value as Record<string, unknown>;
  if (typeof o.datePublished === "string" && o.datePublished.trim()) {
    return o.datePublished.trim();
  }
  if (typeof o.dateCreated === "string" && o.dateCreated.trim()) {
    return o.dateCreated.trim();
  }
  if (typeof o.uploadDate === "string" && o.uploadDate.trim()) {
    return o.uploadDate.trim();
  }

  for (const v of Object.values(o)) {
    const d = findDatePublishedInJsonLd(v);
    if (d) return d;
  }
  return null;
}

const META_PROPERTY_CANDIDATES = [
  "article:published_time",
  "article:published",
  "og:published_time",
  "publishdate",
  "pubdate",
  "date",
  "DC.date.issued",
  "sailthru.date",
  "article:modified_time",
];

/**
 * Extract original article publish time from HTML (not page crawl time).
 */
export function extractPublishedAtFromHtml(html: string): string | null {
  const candidates: string[] = [];

  for (const prop of META_PROPERTY_CANDIDATES) {
    const v = readMetaByProperty(html, prop);
    if (v) candidates.push(v);
  }

  const timeDt = readTimeDatetime(html);
  if (timeDt) candidates.push(timeDt);

  const jsonLd = extractFromJsonLd(html);
  if (jsonLd) candidates.push(jsonLd);

  for (const raw of candidates) {
    const iso = normalizePublishedAtToIso(raw);
    if (iso) return iso;
  }

  return null;
}
