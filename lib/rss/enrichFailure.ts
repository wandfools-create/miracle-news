export type RssEnrichFailureCategory =
  | "body_extraction"
  | "quality_check"
  | "openai"
  | "translate"
  | "apply_db"
  | "unknown";

const CATEGORY_LABELS: Record<RssEnrichFailureCategory, string> = {
  body_extraction: "본문 추출 실패",
  quality_check: "품질 기준 미달",
  openai: "OpenAI 오류",
  translate: "번역 오류",
  apply_db: "저장 오류",
  unknown: "기타 오류",
};

export function getEnrichFailureCategoryLabel(
  category: RssEnrichFailureCategory
): string {
  return CATEGORY_LABELS[category];
}

export function categorizeEnrichFailure(
  step: string,
  error: string
): { category: RssEnrichFailureCategory; categoryLabel: string } {
  const stepNorm = step.trim().toLowerCase();
  const err = error.trim().toLowerCase();

  if (
    stepNorm === "quality_check" ||
    err.includes("품질") ||
    err.includes("900자") ||
    err.includes("5문단") ||
    err.includes("paragraph")
  ) {
    return { category: "quality_check", categoryLabel: CATEGORY_LABELS.quality_check };
  }

  if (
    stepNorm.startsWith("translate") ||
    err.includes("번역") ||
    err.includes("translate")
  ) {
    return { category: "translate", categoryLabel: CATEGORY_LABELS.translate };
  }

  if (
    stepNorm.includes("openai") ||
    stepNorm.includes("summarize") ||
    stepNorm.includes("chat") ||
    err.includes("openai") ||
    err.includes("api key") ||
    err.includes("rate limit")
  ) {
    return { category: "openai", categoryLabel: CATEGORY_LABELS.openai };
  }

  if (stepNorm.startsWith("update_") || stepNorm.startsWith("insert_")) {
    return { category: "apply_db", categoryLabel: CATEGORY_LABELS.apply_db };
  }

  if (
    stepNorm === "analyze_from_link" ||
    err.includes("본문 추출") ||
    err.includes("og:description") ||
    err.includes("body extraction") ||
    err.includes("playwright") ||
    err.includes("cnn")
  ) {
    return {
      category: "body_extraction",
      categoryLabel: CATEGORY_LABELS.body_extraction,
    };
  }

  return { category: "unknown", categoryLabel: CATEGORY_LABELS.unknown };
}

export const RSS_ENRICH_FAILURE_MARKER = "[자동 보강 실패]";

export function formatRssEnrichFailureNote(input: {
  categoryLabel: string;
  step: string;
  error: string;
  at?: string;
}): string {
  const at = input.at ?? new Date().toISOString();
  return [
    RSS_ENRICH_FAILURE_MARKER,
    `유형: ${input.categoryLabel}`,
    `단계: ${input.step}`,
    `사유: ${input.error.trim()}`,
    `시각: ${at}`,
  ].join("\n");
}

export type ParsedRssEnrichFailure = {
  categoryLabel: string;
  step: string | null;
  reason: string;
};

export function parseRssEnrichFailureFromNotes(
  notes: string | null | undefined
): ParsedRssEnrichFailure | null {
  const text = typeof notes === "string" ? notes : "";
  if (!text.includes(RSS_ENRICH_FAILURE_MARKER)) return null;

  const block = text.slice(text.indexOf(RSS_ENRICH_FAILURE_MARKER));
  const categoryMatch = block.match(/유형:\s*(.+)/);
  const stepMatch = block.match(/단계:\s*(.+)/);
  const reasonMatch = block.match(/사유:\s*(.+)/);

  return {
    categoryLabel: categoryMatch?.[1]?.trim() || "자동 보강 실패",
    step: stepMatch?.[1]?.trim() ?? null,
    reason: reasonMatch?.[1]?.trim() || "상세 사유 없음",
  };
}
