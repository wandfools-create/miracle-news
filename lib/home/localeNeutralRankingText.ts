import type { ArticlesContentFields } from "@/lib/article/resolveLocaleContent";
import type { EditionHomeMergeEntry } from "./buildEditionHomeCard";

function addText(parts: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (trimmed) parts.add(trimmed);
}

function addContentFields(parts: Set<string>, fields: ArticlesContentFields) {
  addText(parts, fields.title_original);
  addText(parts, fields.title_ko);
  addText(parts, fields.title_translated);
}

function addSummaryFields(parts: Set<string>, fields: ArticlesContentFields) {
  addText(parts, fields.summary_original);
  addText(parts, fields.summary_ko);
  addText(parts, fields.summary_translated);
}

/** Locale-neutral title/summary for editorial scoring — same signal on KO and EN pages. */
export function buildLocaleNeutralRankingText(entry: EditionHomeMergeEntry): {
  title: string;
  summary: string | null;
} {
  const titles = new Set<string>();
  const summaries = new Set<string>();

  for (const slice of [entry.ko, entry.en]) {
    if (!slice) continue;
    addText(titles, slice.title);
    addText(summaries, slice.summary);
    addContentFields(titles, slice.contentFields);
    addSummaryFields(summaries, slice.contentFields);
  }

  const title = [...titles].join(" ").trim();
  const summaryParts = [...summaries];
  return {
    title: title || "Untitled",
    summary: summaryParts.length ? summaryParts.join(" ") : null,
  };
}
