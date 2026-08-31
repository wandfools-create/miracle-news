import {
  findBestSameEventMatch,
  type StoryDoc,
} from "@/lib/same-event/classifySameEvent";
import { normalizeSource } from "@/lib/article/normalizeSource";
import {
  DUPLICATE_ANGLE_LABELS,
  mapRelationToDuplicateClass,
  type DuplicateAngleEvaluation,
} from "./duplicateAngleTypes";

export type DuplicateMatchRow = StoryDoc & {
  id: string;
  source: string;
  title: string;
  status?: string | null;
  published_at?: string | null;
};

export function evaluateDuplicateAngle(input: {
  originalUrl: string;
  source: string;
  title: string;
  summary?: string | null;
  titleAlt?: string | null;
  existingByUrl?: DuplicateMatchRow | null;
  publishedPool: DuplicateMatchRow[];
  reviewPool?: DuplicateMatchRow[];
}): DuplicateAngleEvaluation {
  const url = input.originalUrl.trim();
  if (url && input.existingByUrl) {
    return {
      class: "exact-original-url",
      hardBlock: true,
      requiresOverride: false,
      recommendedAction: "기존 기사·후보를 열고 새 row를 만들지 않습니다.",
      match: {
        id: input.existingByUrl.id,
        source: input.existingByUrl.source,
        title: input.existingByUrl.title,
        status: input.existingByUrl.status ?? null,
        publishedAt: input.existingByUrl.published_at ?? null,
      },
    };
  }

  const incoming: StoryDoc = {
    title: input.title,
    summary: input.summary,
    titleAlt: input.titleAlt,
    source: input.source,
  };

  const pool = [...input.publishedPool, ...(input.reviewPool ?? [])];
  const hit = findBestSameEventMatch(incoming, pool);
  if (!hit) {
    return {
      class: "ai-uncertain",
      hardBlock: false,
      requiresOverride: false,
      recommendedAction: "관련 기사가 없으면 바로 기사화할 수 있습니다.",
    };
  }

  const sameSource =
    normalizeSource(hit.match.source) === normalizeSource(input.source);
  const duplicateClass = mapRelationToDuplicateClass(
    hit.classification.relation,
    sameSource
  );

  const hardBlock = false;
  const requiresOverride =
    duplicateClass === "same-outlet-same-event" ||
    duplicateClass === "ai-same-article" ||
    duplicateClass === "ai-similar-content";

  let recommendedAction =
    "관련 기사를 확인한 뒤 기사화를 진행하세요.";
  if (duplicateClass === "cross-outlet-same-event") {
    recommendedAction =
      "다른 언론사·같은 사건입니다. 관련 기사를 안내하고 바로 기사화할 수 있습니다.";
  } else if (duplicateClass === "same-outlet-same-event") {
    recommendedAction =
      "같은 언론사·같은 사건으로 보입니다. ‘그래도 기사 만들기’ override 후 검토 대기로 이동합니다.";
  } else if (duplicateClass === "ai-different-angle") {
    recommendedAction = "다른 관점으로 판단됩니다. 기사화를 진행할 수 있습니다.";
  }

  return {
    class: duplicateClass,
    hardBlock,
    requiresOverride,
    recommendedAction,
    match: {
      id: hit.match.id,
      source: hit.match.source,
      title: hit.match.title,
      status: hit.match.status ?? null,
      publishedAt: hit.match.published_at ?? null,
    },
    sharedFacts: hit.classification.sharedTokens.slice(0, 8),
    perspectiveDiff:
      hit.classification.relation === "different_angle"
        ? hit.classification.reason
        : null,
    classification: hit.classification,
  };
}

export function duplicateAngleHeadline(evaluation: DuplicateAngleEvaluation): string {
  return DUPLICATE_ANGLE_LABELS[evaluation.class];
}
