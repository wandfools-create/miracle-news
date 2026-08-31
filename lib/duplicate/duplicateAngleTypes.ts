import type { SameEventClassification } from "@/lib/same-event/classifySameEvent";

export type DuplicateAngleClass =
  | "exact-original-url"
  | "same-outlet-same-event"
  | "cross-outlet-same-event"
  | "ai-same-article"
  | "ai-similar-content"
  | "ai-different-angle"
  | "ai-title-only"
  | "ai-uncertain";

export type DuplicateAngleEvaluation = {
  class: DuplicateAngleClass;
  hardBlock: boolean;
  requiresOverride: boolean;
  recommendedAction: string;
  match?: {
    id: string;
    source: string;
    title: string;
    status?: string | null;
    publishedAt?: string | null;
  };
  sharedFacts?: string[];
  newFacts?: string[];
  perspectiveDiff?: string | null;
  classification?: SameEventClassification;
};

export const DUPLICATE_ANGLE_LABELS: Record<DuplicateAngleClass, string> = {
  "exact-original-url": "동일 original_url",
  "same-outlet-same-event": "같은 언론사·같은 사건·다른 URL",
  "cross-outlet-same-event": "다른 언론사·같은 사건",
  "ai-same-article": "사실상 같은 기사",
  "ai-similar-content": "같은 사건, 비슷한 내용",
  "ai-different-angle": "같은 사건, 다른 관점",
  "ai-title-only": "제목만 비슷한 별도 기사",
  "ai-uncertain": "판단 불확실",
};

export function mapRelationToDuplicateClass(
  relation: SameEventClassification["relation"],
  sameSource: boolean
): DuplicateAngleClass {
  if (relation === "same_event") {
    return sameSource ? "same-outlet-same-event" : "cross-outlet-same-event";
  }
  if (relation === "different_angle") return "ai-different-angle";
  if (relation === "update") return "ai-similar-content";
  if (relation === "ambiguous") return "ai-uncertain";
  return "ai-title-only";
}
