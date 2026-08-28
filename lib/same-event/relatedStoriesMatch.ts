import {
  classifySameEvent,
  type StoryDoc,
  type StoryRelation,
} from "@/lib/same-event/classifySameEvent";

export type RelatedStoryKind = "candidate" | "article";

export type RelatedStoryRef = {
  id: string;
  kind: RelatedStoryKind;
  relation: StoryRelation | "ambiguous_possible";
  relationLabel: string;
  title: string;
  source: string;
  publishedAt: string | null;
  statusLabel: string;
  href: string | null;
  diffNote: string | null;
};

export type RelatedStoryPoolRow = StoryDoc & {
  id: string;
  kind: RelatedStoryKind;
  source: string;
  title: string;
  statusLabel: string;
  href: string | null;
};

const RELATION_LABEL: Record<StoryRelation | "ambiguous_possible", string> = {
  same_event: "SAME EVENT",
  update: "UPDATE 가능",
  different_angle: "DIFFERENT ANGLE 가능",
  unrelated: "관련 없음",
  ambiguous: "유사 가능성 — 확인 필요",
  ambiguous_possible: "유사 가능성 — 확인 필요",
};

function relationLabel(
  relation: StoryRelation,
  confidence: string
): StoryRelation | "ambiguous_possible" {
  if (relation === "ambiguous" && confidence === "low") {
    return "ambiguous_possible";
  }
  return relation;
}

function shouldShowRelated(
  relation: StoryRelation | "ambiguous_possible",
  titleShared: number,
  entityShared: number
): boolean {
  if (relation === "unrelated") return false;
  if (relation === "ambiguous_possible") {
    return titleShared >= 1 || entityShared >= 2;
  }
  return true;
}

export function findRelatedStoriesForDoc(
  target: StoryDoc & { id: string },
  pool: RelatedStoryPoolRow[],
  options?: { excludeId?: string; limit?: number }
): RelatedStoryRef[] {
  const limit = options?.limit ?? 4;
  const excludeId = options?.excludeId;

  const hits: RelatedStoryRef[] = [];

  for (const row of pool) {
    if (excludeId && row.id === excludeId) continue;

    const classification = classifySameEvent(target, row);
    const rel = relationLabel(
      classification.relation,
      classification.confidence
    );

    if (
      !shouldShowRelated(
        rel,
        classification.titleShared,
        classification.entityShared
      )
    ) {
      continue;
    }

    hits.push({
      id: row.id,
      kind: row.kind,
      relation: rel,
      relationLabel: RELATION_LABEL[rel],
      title: row.title,
      source: row.source,
      publishedAt: row.publishedAt ?? null,
      statusLabel: row.statusLabel,
      href: row.href,
      diffNote:
        rel === "update" || rel === "different_angle"
          ? classification.reason
          : rel === "ambiguous_possible"
            ? classification.reason
            : null,
    });
  }

  hits.sort((a, b) => {
    const rank = (r: RelatedStoryRef["relation"]) => {
      switch (r) {
        case "same_event":
          return 0;
        case "update":
          return 1;
        case "different_angle":
          return 2;
        case "ambiguous_possible":
          return 3;
        default:
          return 4;
      }
    };
    return rank(a.relation) - rank(b.relation);
  });

  return hits.slice(0, limit);
}

export type CandidateRelatedInput = {
  id: string;
  source: string;
  rssTitle: string;
  rssSummary: string | null;
  rssPublishedAt: string | null;
  articleId?: string | null;
};

export function batchRelatedStoriesForCandidates(
  candidates: CandidateRelatedInput[],
  pool: RelatedStoryPoolRow[]
): Map<string, RelatedStoryRef[]> {
  const map = new Map<string, RelatedStoryRef[]>();

  for (const c of candidates) {
    const doc: StoryDoc & { id: string } = {
      id: c.id,
      title: c.rssTitle,
      summary: c.rssSummary,
      source: c.source,
      publishedAt: c.rssPublishedAt,
    };

    const related = findRelatedStoriesForDoc(doc, pool, {
      excludeId: c.id,
      limit: 4,
    }).filter((r) => r.id !== c.articleId);

    if (related.length > 0) {
      map.set(c.id, related);
    }
  }

  return map;
}
