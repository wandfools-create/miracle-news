import {
  classifySameEvent,
  isClearSameEvent,
  type StoryDoc,
} from "@/lib/same-event/classifySameEvent";

export type ShortsArticleForDedup = {
  id: string;
  title_ko: string | null;
  title_original: string | null;
  summary_ko: string | null;
  summary_original: string | null;
  source: string | null;
  published_at: string | null;
};

function toStoryDoc(article: ShortsArticleForDedup): StoryDoc {
  return {
    id: article.id,
    title: article.title_ko ?? article.title_original ?? "",
    titleAlt: article.title_original,
    summary: article.summary_ko ?? article.summary_original,
    summaryAlt: article.summary_original,
    source: article.source,
    publishedAt: article.published_at,
  };
}

/**
 * Remove clear SAME EVENT duplicates from a Shorts selection.
 * Keeps the first article; UPDATE / DIFFERENT ANGLE pairs are allowed.
 */
export function dedupeShortsArticleSelection<T extends ShortsArticleForDedup>(
  articles: T[]
): { kept: T[]; removed: Array<{ id: string; reason: string; duplicateOf: string }> } {
  const kept: T[] = [];
  const removed: Array<{ id: string; reason: string; duplicateOf: string }> = [];

  for (const candidate of articles) {
    const candidateDoc = toStoryDoc(candidate);
    let duplicateOf: string | null = null;
    let reason = "";

    for (const existing of kept) {
      const classification = classifySameEvent(toStoryDoc(existing), candidateDoc);
      if (isClearSameEvent(classification)) {
        duplicateOf = existing.id;
        reason = classification.reason;
        break;
      }
    }

    if (duplicateOf) {
      removed.push({ id: candidate.id, reason, duplicateOf });
    } else {
      kept.push(candidate);
    }
  }

  return { kept, removed };
}
