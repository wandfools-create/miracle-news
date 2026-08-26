import {
  findBestSameEventMatch,
  findSoftSameEventWarningMatch,
  isClearSameEvent,
  shouldSuppressIncomingSameEvent,
  type StoryDoc,
} from "@/lib/same-event/classifySameEvent";

export type SameEventCandidateRow = StoryDoc & {
  id: string;
  source: string;
  rss_title: string;
};

export type SameEventPublishedRow = StoryDoc & {
  id: string;
  source: string;
  title_ko: string | null;
  title_original: string | null;
  published_at: string | null;
};

export type CollectSameEventDecision =
  | { action: "allow" }
  | {
      action: "suppress";
      existingId: string;
      existingSource: string;
      existingTitle: string;
      reason: string;
    };

export function decideCollectSameEvent(
  incoming: StoryDoc,
  recent: SameEventCandidateRow[]
): CollectSameEventDecision {
  const hit = findBestSameEventMatch(incoming, recent);
  if (!hit) return { action: "allow" };
  if (
    !shouldSuppressIncomingSameEvent(incoming, hit.match, hit.classification)
  ) {
    return { action: "allow" };
  }
  return {
    action: "suppress",
    existingId: hit.match.id,
    existingSource: hit.match.source,
    existingTitle: hit.match.title,
    reason: hit.classification.reason,
  };
}

export type PublishedSameEventGuard =
  | { blocked: false; softWarning?: SameEventPublishedRow; softReason?: string }
  | {
      blocked: true;
      match: SameEventPublishedRow;
      reason: string;
    };

export function evaluatePublishedSameEventGuard(
  incoming: StoryDoc,
  published: SameEventPublishedRow[],
  options?: { excludeArticleId?: string }
): PublishedSameEventGuard {
  const pool = options?.excludeArticleId
    ? published.filter((p) => p.id !== options.excludeArticleId)
    : published;

  const clear = findBestSameEventMatch(incoming, pool);
  if (clear && isClearSameEvent(clear.classification)) {
    return {
      blocked: true,
      match: clear.match,
      reason: clear.classification.reason,
    };
  }

  const soft = findSoftSameEventWarningMatch(incoming, pool);
  if (soft) {
    return {
      blocked: false,
      softWarning: soft.match,
      softReason: soft.classification.reason,
    };
  }

  return { blocked: false };
}
