/**
 * Repair misclassified home/article category "other" using title/summary signals.
 * Separate from admin candidate filters — pure, no OpenAI.
 */

import {
  classifyCandidateCategory,
  type CandidateCategoryKey,
} from "@/lib/collection-candidates/candidateCategory";

export type HomeCategoryKey =
  | "politics"
  | "economy"
  | "society"
  | "world"
  | "science"
  | "tech"
  | "other"
  | string;

/**
 * When stored category is empty/other, infer a better bucket for home grouping.
 * Never invents topics; falls back to "other".
 */
export function repairHomeCategory(input: {
  category?: string | null;
  title?: string | null;
  summary?: string | null;
  source?: string | null;
}): string {
  const raw = (input.category || "").trim().toLowerCase();
  if (raw && raw !== "other" && raw !== "uncategorized" && raw !== "misc") {
    return normalizeHomeCategory(raw);
  }

  const inferred = classifyCandidateCategory({
    source: input.source || "",
    rssTitle: input.title || "",
    rssSummary: input.summary,
    category: null,
  });

  return mapCandidateCategoryToHome(inferred);
}

export function normalizeHomeCategory(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (key === "science_tech" || key === "science-tech") return "science";
  if (key === "major_issue") return "world";
  if (key === "religion") return "society";
  return key || "other";
}

export function mapCandidateCategoryToHome(
  key: CandidateCategoryKey
): string {
  switch (key) {
    case "politics":
      return "politics";
    case "economy":
      return "economy";
    case "society":
      return "society";
    case "world":
    case "major_issue":
      return "world";
    case "science_tech":
      return "science";
    case "religion":
      return "society";
    default:
      return "other";
  }
}
