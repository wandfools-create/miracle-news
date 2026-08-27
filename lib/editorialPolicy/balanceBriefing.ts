/**
 * 「한눈 균형 브리핑」 package shapes — no OpenAI, no invented counter-arguments.
 * Public contract for Shorts PR #5. See EDITORIAL_POLICY.md §10.
 */

export type BalanceContentType =
  | "news_report"
  | "analysis"
  | "editorial"
  | "advocacy"
  | "official_statement"
  | "unknown";

export type BalancePerspectiveRole =
  | "government"
  | "opposition"
  | "market"
  | "industry"
  | "expert"
  | "foreign"
  | "other";

export type BalancePerspective = {
  /** Speaker / institution name as attributed in sources. */
  actor: string;
  position: string;
  supportingBasis: string;
  /** Article/localization ids that support this perspective — required when known. */
  sourceArticleIds: string[];
  /** Optional original URLs when article ids are unavailable. */
  sourceUrls?: string[];
  role?: BalancePerspectiveRole;
  contentType?: BalanceContentType;
};

export type BalanceClaim = {
  text: string;
  actor?: string;
  sourceArticleIds?: string[];
  /** True when claim conflicts with cited official stats/records (never store as verified). */
  conflictsWithOfficialRecord?: boolean;
};

export type HannoonBalanceBriefing = {
  factualCore: string[];
  verifiedFacts: string[];
  claims: BalanceClaim[];
  perspectives: BalancePerspective[];
  keyDisagreement: string | null;
  verifiedVsClaimed: {
    verified: string[];
    claimed: string[];
  };
  missingPerspectives: string[];
  whatToWatch: string[];
  balanceNotes: string;
  /** Always true — AI package never auto-publishes. */
  humanReviewRequired: true;
  status: "ok" | "needs_other_viewpoint" | "insufficient_sources";
  warning: string | null;
  /** @deprecated use status/warning — kept for older callers */
  needsOtherViewpoint?: boolean;
};

export const HANNOON_BALANCE_AVOID_PHRASES = [
  "누가 맞는지는 알 수 없습니다",
  "양쪽 모두 일리가 있습니다",
  "논란이 되고 있습니다",
  "충격적인 진실입니다",
  "완전히 거짓입니다",
] as const;

export const HANNOON_BALANCE_PREFERRED_PATTERNS = [
  "정부는",
  "반면 야당은",
  "현재 확인된 사실은",
  "핵심 쟁점은",
] as const;

/** Canonical warning when opposing viewpoints are not sourced. */
export const MISSING_VIEWPOINT_LABEL = "다른 주요 관점 확인 필요";

export function emptyBalanceBriefing(
  notes = "자료 부족 — 사람 검토 필요"
): HannoonBalanceBriefing {
  return {
    factualCore: [],
    verifiedFacts: [],
    claims: [],
    perspectives: [],
    keyDisagreement: null,
    verifiedVsClaimed: { verified: [], claimed: [] },
    missingPerspectives: ["주요 반대·대안 관점"],
    whatToWatch: [],
    balanceNotes: notes,
    humanReviewRequired: true,
    status: "insufficient_sources",
    warning: MISSING_VIEWPOINT_LABEL,
    needsOtherViewpoint: true,
  };
}

/** Reject empty both-sides filler; keep concrete speaker-attributed lines. */
export function containsAvoidedBalancePhrase(text: string): boolean {
  const t = text.replace(/\s+/g, " ");
  return HANNOON_BALANCE_AVOID_PHRASES.some((p) => t.includes(p));
}

function cleanLines(values: string[] | undefined): string[] {
  return (values ?? []).map((s) => s.trim()).filter(Boolean);
}

function hasOpposingPerspectives(perspectives: BalancePerspective[]): boolean {
  if (perspectives.length < 2) return false;
  const roles = new Set(perspectives.map((p) => p.role).filter(Boolean));
  if (roles.size >= 2) return true;
  const actors = new Set(
    perspectives.map((p) => p.actor.trim().toLowerCase()).filter(Boolean)
  );
  return actors.size >= 2;
}

function perspectivesHaveSourceLinks(perspectives: BalancePerspective[]): boolean {
  if (perspectives.length === 0) return false;
  return perspectives.every(
    (p) =>
      (p.sourceArticleIds && p.sourceArticleIds.length > 0) ||
      (p.sourceUrls && p.sourceUrls.length > 0)
  );
}

/**
 * Build a balance shell from already-extracted facts/claims/perspectives.
 * Never invents an opposition view. Never promotes conflicting claims to verified.
 */
export function buildBalanceBriefing(input: {
  factualCore?: string[];
  verifiedFacts?: string[];
  claims?: BalanceClaim[];
  perspectives: BalancePerspective[];
  keyDisagreement?: string | null;
  /** @deprecated prefer verifiedFacts */
  verified?: string[];
  /** @deprecated prefer claims[].text */
  claimed?: string[];
  missingPerspectives?: string[];
  whatToWatch?: string[];
  balanceNotes?: string;
}): HannoonBalanceBriefing {
  const perspectives = input.perspectives.map((p) => ({
    ...p,
    actor: (p.actor || "").trim(),
    position: p.position.trim(),
    supportingBasis: p.supportingBasis.trim(),
    sourceArticleIds: [...(p.sourceArticleIds ?? [])],
    sourceUrls: p.sourceUrls ? [...p.sourceUrls] : undefined,
    contentType: p.contentType ?? "unknown",
  }));

  const verifiedFacts = cleanLines(
    input.verifiedFacts?.length ? input.verifiedFacts : input.verified
  );
  const claims: BalanceClaim[] = (input.claims ?? []).map((c) => ({
    ...c,
    text: c.text.trim(),
  }));
  // Legacy claimed[] strings → claims without inventing actors
  if (claims.length === 0 && input.claimed?.length) {
    for (const text of cleanLines(input.claimed)) {
      claims.push({ text });
    }
  }

  // Official-record conflicts must never appear as verified facts.
  const conflicting = new Set(
    claims
      .filter((c) => c.conflictsWithOfficialRecord)
      .map((c) => c.text.toLowerCase())
  );
  const safeVerified = verifiedFacts.filter(
    (f) => !conflicting.has(f.toLowerCase())
  );
  const claimedTexts = claims.map((c) => c.text);

  const opposing = hasOpposingPerspectives(perspectives);
  const linked = perspectivesHaveSourceLinks(perspectives);
  const missingPerspectives = cleanLines(input.missingPerspectives);

  let status: HannoonBalanceBriefing["status"] = "ok";
  let warning: string | null = null;

  if (perspectives.length === 0) {
    status = "insufficient_sources";
    warning = MISSING_VIEWPOINT_LABEL;
    if (!missingPerspectives.includes("주요 반대·대안 관점")) {
      missingPerspectives.push("주요 반대·대안 관점");
    }
  } else if (!opposing) {
    status = "needs_other_viewpoint";
    warning = MISSING_VIEWPOINT_LABEL;
    if (!missingPerspectives.length) {
      missingPerspectives.push("다른 주요 관점");
    }
  } else if (!linked) {
    status = "needs_other_viewpoint";
    warning = "관점별 출처 기사·URL 연결 필요";
  }

  const notes =
    input.balanceNotes?.trim() ||
    (status === "ok"
      ? "복수의 관점이 제공된 기사·공식 자료에 근거함 (1:1 기계 균형 아님)"
      : warning || MISSING_VIEWPOINT_LABEL);

  const factualCore = cleanLines(
    input.factualCore?.length ? input.factualCore : safeVerified
  );

  return {
    factualCore,
    verifiedFacts: safeVerified,
    claims,
    perspectives,
    keyDisagreement: input.keyDisagreement?.trim() || null,
    verifiedVsClaimed: {
      verified: safeVerified,
      claimed: claimedTexts,
    },
    missingPerspectives,
    whatToWatch: cleanLines(input.whatToWatch),
    balanceNotes: notes,
    humanReviewRequired: true,
    status,
    warning,
    needsOtherViewpoint: status !== "ok",
  };
}

export function humanBalanceReviewChecklist(): string[] {
  return [
    "원문 발언이 왜곡되지 않았는지",
    "사실과 주장이 구분됐는지",
    "주요 반대 관점이 누락되지 않았는지",
    "근거 없는 양비론이 아닌지",
    "자막만 봐도 누가 한 말인지 알 수 있는지",
    "관점마다 sourceArticleId 또는 URL이 있는지",
    "자동 공개·자동 업로드 금지 유지",
  ];
}

/** Public contract surface for Shorts PR #5 integration. */
export const SHORTS_BALANCE_PUBLIC_CONTRACT = {
  buildBalanceBriefing,
  emptyBalanceBriefing,
  MISSING_VIEWPOINT_LABEL,
  humanReviewRequiredDefault: true as const,
  packageFields: [
    "factualCore",
    "verifiedFacts",
    "claims",
    "perspectives",
    "keyDisagreement",
    "verifiedVsClaimed",
    "missingPerspectives",
    "whatToWatch",
    "balanceNotes",
    "humanReviewRequired",
    "status",
    "warning",
  ] as const,
} as const;
