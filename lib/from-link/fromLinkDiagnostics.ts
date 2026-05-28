/** Client-safe diagnostics types for from-link analyze UI. */

export type FromLinkQualityCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
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
  /** User may opt in to save despite soft quality failures (e.g. body &lt; 900 chars). */
  canAllowShortSourceDraft: boolean;
};

export const FROM_LINK_QUALITY_LIMITS = {
  minSourceBodyChars: 400,
  minMaterialChars: 400,
  minGeneratedBodyKoChars: 900,
  minGeneratedBodyParagraphs: 5,
  minSummaryChars: 30,
  maxSummaryChars: 500,
  maxSummaryBodySimilarity: 0.62,
} as const;
