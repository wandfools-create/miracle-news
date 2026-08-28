/**
 * Public contract for Shorts PR #5 integration.
 * Do not change PR #5 UI on this branch — import these symbols after policy merge.
 *
 * Recommended order: merge this policy branch → merge latest main into PR #5
 * (prefer full main merge over cherry-pick).
 */
export {
  adviseShortsSelection,
  countPoliticsEconomyArticles,
  recommendedShortsCountRange,
  shortsDeskFitScore,
  type ShortsSelectionAdvice,
} from "./shortsSelection";

export {
  buildBalanceBriefing,
  emptyBalanceBriefing,
  humanBalanceReviewChecklist,
  MISSING_VIEWPOINT_LABEL,
  SHORTS_BALANCE_PUBLIC_CONTRACT,
  type BalanceClaim,
  type BalanceContentType,
  type BalancePerspective,
  type HannoonBalanceBriefing,
} from "./balanceBriefing";

export const SHORTS_PR5_INTEGRATION_NOTES = {
  humanReviewRequired: true,
  autoPublishForbidden: true,
  autoUploadForbidden: true,
  missingViewpointWarning: "다른 주요 관점 확인 필요",
  majorityPoliticsEconomy: "recommended_not_forced",
  mergeOrder: "policy-branch → main → merge main into PR #5",
} as const;
