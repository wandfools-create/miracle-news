/** Client-safe diagnostics types for from-link analyze UI. */

export type FromLinkQualityCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  severity?: "fail" | "warn";
};

export type FromLinkExtractionStats = {
  httpBodyChars: number;
  httpExtractSuccess: boolean;
  httpExtractMethod: string | null;
  playwrightBodyChars: number;
  playwrightExtractSuccess: boolean;
  playwrightExtractMethod: string | null;
};

export type FromLinkAnalyzeDiagnostics = {
  extraction: FromLinkExtractionStats;
  supplementalChars: number;
  /** Characters in the prompt sent to OpenAI (원문 자료). */
  finalMaterialChars: number;
  /** Final extracted article body used for analysis. */
  finalBodyChars: number;
  bodyPreview800: string;
  /** Generated Korean body length (0 if summarize did not complete). */
  generatedBodyKoChars: number;
  qualityChecks: FromLinkQualityCheckItem[];
  /** User may opt in to save despite generated-body content failures when source is adequate. */
  canAllowShortSourceDraft: boolean;
};

export const FROM_LINK_QUALITY_LIMITS = {
  minSourceBodyChars: 400,
  minMaterialChars: 400,
  /** Hard fail only below this. 900 is a recommended target, not a fail gate. */
  minGeneratedBodyKoChars: 500,
  targetGeneratedBodyKoCharsMin: 900,
  targetGeneratedBodyKoCharsMax: 1200,
  /** Warning only — never a hard fail. */
  warnGeneratedBodyParagraphs: 3,
  minSummaryChars: 30,
  maxSummaryChars: 500,
  maxSummaryBodySimilarity: 0.62,
} as const;
