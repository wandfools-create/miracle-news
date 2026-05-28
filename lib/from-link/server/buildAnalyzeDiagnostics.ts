import "server-only";

import { MIN_USABLE_BODY_CHARS } from "../constants";
import type {
  FromLinkAnalyzeDiagnostics,
  FromLinkExtractionStats,
  FromLinkQualityCheckItem,
} from "../fromLinkDiagnostics";
import type { ExtractedPreview } from "../types";
import {
  canAllowShortSourceDraftOverride,
  evaluateFromLinkDraftQualityChecks,
} from "../validateArticleQuality";

function extractionStatsFromPreview(
  extracted: ExtractedPreview
): FromLinkExtractionStats {
  const stats = extracted.extractionStats;
  if (stats) return stats;

  const finalLen = extracted.articleBodyPlain?.length ?? 0;
  const method = extracted.pageFetchMethod;
  const base = {
    httpBodyChars: method === "http" ? finalLen : 0,
    httpExtractSuccess:
      method === "http" && extracted.articleBodyExtractSuccess === true,
    httpExtractMethod:
      method === "http" ? extracted.articleBodyExtractMethod ?? null : null,
    playwrightBodyChars: method === "playwright" ? finalLen : 0,
    playwrightExtractSuccess:
      method === "playwright" && extracted.articleBodyExtractSuccess === true,
    playwrightExtractMethod:
      method === "playwright"
        ? extracted.articleBodyExtractMethod ?? null
        : null,
  };
  return base;
}

export function buildFromLinkAnalyzeDiagnostics(input: {
  extracted: ExtractedPreview;
  supplementalChars: number;
  finalMaterialChars: number;
  draftPreview?: {
    titleKo: string;
    summaryKo: string;
    bodyKo: string;
  };
  extraChecks?: FromLinkQualityCheckItem[];
}): FromLinkAnalyzeDiagnostics {
  const finalBody = input.extracted.articleBodyPlain?.trim() ?? "";
  const qualityChecks = input.draftPreview
    ? evaluateFromLinkDraftQualityChecks({
        submittedOriginalUrl: input.extracted.submittedOriginalUrl,
        titleKo: input.draftPreview.titleKo,
        summaryKo: input.draftPreview.summaryKo,
        bodyKo: input.draftPreview.bodyKo,
      })
    : [];

  const allChecks = [...(input.extraChecks ?? []), ...qualityChecks];
  const canAllowShortSourceDraft = canAllowShortSourceDraftOverride(
    qualityChecks,
    finalBody.length,
    input.supplementalChars,
    MIN_USABLE_BODY_CHARS
  );

  return {
    extraction: extractionStatsFromPreview(input.extracted),
    supplementalChars: input.supplementalChars,
    finalMaterialChars: input.finalMaterialChars,
    finalBodyChars: finalBody.length,
    bodyPreview800: finalBody.slice(0, 800),
    generatedBodyKoChars: input.draftPreview?.bodyKo.trim().length ?? 0,
    qualityChecks: allChecks,
    canAllowShortSourceDraft,
  };
}
