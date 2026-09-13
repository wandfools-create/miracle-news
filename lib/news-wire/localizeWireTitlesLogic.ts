/**
 * Pure / injectable News Wire title-localize helpers (no server-only).
 * Used by localizeWireTitles.ts and unit tests.
 */
import {
  isWireEnTitleReady,
  isWireKoTitleReady,
  isWireTitlesReady,
  trimTitle,
} from "@/lib/news-wire/wireTitles";

export const WIRE_LOCALIZE_BATCH_SIZE = 40;
export const WIRE_LOCALIZE_MAX_PER_COLLECT = 40;

export type WireLocalizeRow = {
  id: string;
  rss_title: string;
  rss_title_ko: string | null;
  rss_title_en: string | null;
  wire_titles_ready_at: string | null;
  created_at?: string;
  status?: string;
};

export function clampWireLocalizeLimit(raw?: number): number {
  return Math.min(
    WIRE_LOCALIZE_MAX_PER_COLLECT,
    Math.max(1, raw ?? WIRE_LOCALIZE_BATCH_SIZE)
  );
}

export function needsLocalization(row: WireLocalizeRow): boolean {
  return !isWireTitlesReady(row);
}

/**
 * Simulate DB filter: wire_titles_ready_at IS NULL, newest first, max limit.
 * Ready rows must not occupy slots ahead of older unready backlog.
 */
export function selectUnreadyWireLocalizeBatch(
  rowsNewestFirst: WireLocalizeRow[],
  limit = WIRE_LOCALIZE_BATCH_SIZE
): WireLocalizeRow[] {
  const capped = clampWireLocalizeLimit(limit);
  return rowsNewestFirst
    .filter((row) => row.wire_titles_ready_at == null)
    .slice(0, capped);
}

/**
 * After fetching unready (or by-id) rows, keep those still needing work
 * and drop already-complete rows (idempotent re-run).
 */
export function filterStillNeedingLocalization(
  rows: WireLocalizeRow[],
  limit = WIRE_LOCALIZE_BATCH_SIZE
): { needing: WireLocalizeRow[]; skippedReady: number } {
  const capped = clampWireLocalizeLimit(limit);
  const needing: WireLocalizeRow[] = [];
  let skippedReady = 0;
  for (const row of rows) {
    if (!needsLocalization(row)) {
      skippedReady += 1;
      continue;
    }
    if (needing.length < capped) needing.push(row);
  }
  return { needing, skippedReady };
}

export type WireLocalizeOpenAiItem = {
  id?: unknown;
  title_ko?: unknown;
  title_en?: unknown;
};

export type WireTitlePatch = {
  id: string;
  patch: Record<string, string | null>;
};

/**
 * Build DB patches from OpenAI items. Returns error if any needing row
 * is missing or has malformed/incomplete titles for required sides.
 */
export function buildWireTitlePatchesFromOpenAi(options: {
  needing: WireLocalizeRow[];
  items: WireLocalizeOpenAiItem[] | null | undefined;
}):
  | { ok: true; patches: WireTitlePatch[] }
  | { ok: false; error: string; step: "openai_items" } {
  const items = options.items;
  if (!Array.isArray(items)) {
    return {
      ok: false,
      error: "openai_items_missing_or_invalid",
      step: "openai_items",
    };
  }

  const byId = new Map<string, WireLocalizeOpenAiItem>();
  for (const item of items) {
    const id = String(item.id ?? "").trim();
    if (id) byId.set(id, item);
  }

  const patches: WireTitlePatch[] = [];
  for (const row of options.needing) {
    const item = byId.get(row.id);
    if (!item) {
      return {
        ok: false,
        error: `openai_item_missing:${row.id}`,
        step: "openai_items",
      };
    }

    const titleKo = trimTitle(String(item.title_ko ?? ""));
    const titleEn = trimTitle(String(item.title_en ?? ""));
    const needKo = !isWireKoTitleReady(row);
    const needEn = !isWireEnTitleReady(row);

    if (needKo && !titleKo) {
      return {
        ok: false,
        error: `openai_title_ko_missing:${row.id}`,
        step: "openai_items",
      };
    }
    if (needEn && !titleEn) {
      return {
        ok: false,
        error: `openai_title_en_missing:${row.id}`,
        step: "openai_items",
      };
    }

    const nextKo = needKo
      ? titleKo
      : trimTitle(row.rss_title_ko) ||
        (isWireKoTitleReady(row) ? trimTitle(row.rss_title) : null);
    const nextEn = needEn
      ? titleEn
      : trimTitle(row.rss_title_en) ||
        (isWireEnTitleReady(row) ? trimTitle(row.rss_title) : null);

    const merged = {
      ...row,
      rss_title_ko: nextKo,
      rss_title_en: nextEn,
    };
    if (!isWireTitlesReady(merged)) {
      return {
        ok: false,
        error: `openai_titles_incomplete:${row.id}`,
        step: "openai_items",
      };
    }

    const patch: Record<string, string | null> = {
      wire_titles_ready_at: new Date().toISOString(),
    };
    if (needKo && nextKo) patch.rss_title_ko = nextKo.slice(0, 300);
    if (needEn && nextEn) patch.rss_title_en = nextEn.slice(0, 300);
    patches.push({ id: row.id, patch });
  }

  return { ok: true, patches };
}
