import "server-only";

import { detectLinkType, linkTypeLabel } from "@/lib/from-link/detectLinkType";
import { extractContent } from "@/lib/from-link/extractContent";
import { proposeCandidates } from "@/lib/from-link/proposeCandidates";
import { resolveSubmittedUrl } from "@/lib/from-link/resolveSubmittedUrl";
import { sanitizeThumbnailUrl } from "@/lib/from-link/sanitizeThumbnail";
import {
  measureFromLinkSourceMaterial,
  summarizeForArticle,
} from "@/lib/from-link/summarizeForArticle";
import { buildFromLinkAnalyzeDiagnostics } from "@/lib/from-link/server/buildAnalyzeDiagnostics";
import {
  buildTranscriptDiagnostic,
  validateYouTubeTranscriptForCandidates,
} from "@/lib/from-link/transcriptDiagnostic";
import { isSuccessfulBodyExtraction } from "@/lib/from-link/articleBodyValidation";
import { MIN_USABLE_BODY_CHARS } from "@/lib/from-link/constants";
import { normalizeSupplementalText } from "@/lib/from-link/supplementalText";
import { countSubstantiveParagraphs } from "@/lib/from-link/sanitizeArticleText";
import { countBodyParagraphs } from "@/lib/from-link/server/publisherExtractors/shared";
import type { FromLinkQualityCheckItem } from "@/lib/from-link/fromLinkDiagnostics";
import {
  MIN_BODY_CHARS,
  isShortArticleRecommendedReview,
  validateFromLinkDraftQuality,
} from "@/lib/from-link/validateArticleQuality";
import type { AnalyzeFromLinkOptions, AnalyzeFromLinkResult } from "@/lib/from-link/actionTypes";
import type { ArticleDraftPayload, ExtractedPreview } from "@/lib/from-link/types";

function bodyExtractionGateCheck(
  extracted: ExtractedPreview,
  supplementalChars: number
): FromLinkQualityCheckItem {
  const bodyLen = extracted.articleBodyPlain?.length ?? 0;
  const passed =
    isSuccessfulBodyExtraction(extracted) ||
    supplementalChars >= MIN_USABLE_BODY_CHARS;
  return {
    id: "body_extraction",
    label: `기사 본문 추출 (최소 ${MIN_USABLE_BODY_CHARS}자 또는 보강)`,
    passed,
    detail: `추출 ${bodyLen}자 · 보강 ${supplementalChars}자`,
  };
}

function isCnnUrl(input: URL): boolean {
  const host = input.hostname.toLowerCase();
  return host === "cnn.com" || host.endsWith(".cnn.com");
}

/** Shared from-link analyze pipeline (admin UI + RSS auto-enrich). */
export async function analyzeFromLinkCore(
  urlRaw: string,
  supplementalTextRaw?: string | null,
  options?: AnalyzeFromLinkOptions
): Promise<AnalyzeFromLinkResult> {
  const supplementalText = normalizeSupplementalText(supplementalTextRaw);
  const supplementalChars = supplementalText?.length ?? 0;
  const allowShortSourceDraft = options?.allowShortSourceDraft === true;
  const resolved = resolveSubmittedUrl(urlRaw);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const submittedOriginalUrl = resolved.href;
  const url = new URL(submittedOriginalUrl);

  const linkType = detectLinkType(url);
  const isCnnArticleLink = linkType === "article" && isCnnUrl(url);
  const extractedBase = await extractContent(linkType, submittedOriginalUrl);
  const extracted: ExtractedPreview = {
    ...extractedBase,
    submittedOriginalUrl,
    rawUrl: submittedOriginalUrl,
    thumbnailUrl: sanitizeThumbnailUrl(extractedBase.thumbnailUrl),
  };

  const label = linkTypeLabel(linkType);
  const transcript = buildTranscriptDiagnostic(linkType, extracted);

  const failPayload = {
    transcript,
    extracted,
    linkType,
    linkTypeLabel: label,
  };

  if (linkType === "youtube") {
    const transcriptCheck = validateYouTubeTranscriptForCandidates(
      transcript,
      supplementalText?.length ?? 0
    );
    if (!transcriptCheck.ok) {
      return { ok: false, error: transcriptCheck.error, ...failPayload };
    }
  }

  const needsArticleBody =
    linkType === "article" || linkType === "x" || linkType === "instagram";
  if (isCnnArticleLink && !isSuccessfulBodyExtraction(extracted)) {
    const materialChars = await measureFromLinkSourceMaterial(
      linkType,
      submittedOriginalUrl,
      extracted,
      supplementalText
    );
    return {
      ok: false,
      error:
        "CNN 기사 본문 접근이 제한되어 패스합니다. 다른 기사 링크를 사용해 주세요.",
      ...failPayload,
      diagnostics: buildFromLinkAnalyzeDiagnostics({
        extracted,
        supplementalChars,
        finalMaterialChars: materialChars,
        extraChecks: [
          bodyExtractionGateCheck(extracted, supplementalChars),
          {
            id: "cnn_body_access",
            label: "CNN 본문 추출 성공 필수",
            passed: false,
            detail:
              "CNN 링크는 메타 설명만으로 생성하지 않고 본문 추출 성공 시에만 진행",
          },
        ],
      }),
    };
  }

  if (
    needsArticleBody &&
    !isSuccessfulBodyExtraction(extracted) &&
    supplementalChars < MIN_USABLE_BODY_CHARS
  ) {
    const materialChars = await measureFromLinkSourceMaterial(
      linkType,
      submittedOriginalUrl,
      extracted,
      supplementalText
    );
    const bodyLen = extracted.articleBodyPlain?.length ?? 0;
    const extractMethod = extracted.articleBodyExtractMethod ?? "unknown";
    const fetchMethod = extracted.pageFetchMethod ?? "unknown";
    return {
      ok: false,
      error:
        `본문 추출 실패: ${bodyLen}자 · 추출=${extractMethod} · fetch=${fetchMethod}. og:description만으로는 진행하지 않습니다. 원문 보강 텍스트를 붙이거나 다른 URL을 시도해 주세요.`,
      ...failPayload,
      diagnostics: buildFromLinkAnalyzeDiagnostics({
        extracted,
        supplementalChars,
        finalMaterialChars: materialChars,
        extraChecks: [bodyExtractionGateCheck(extracted, supplementalChars)],
      }),
    };
  }

  const summary = await summarizeForArticle(
    linkType,
    submittedOriginalUrl,
    extracted,
    label,
    { supplementalTextRaw: supplementalText }
  );
  if (!summary.ok) {
    return {
      ok: false,
      error: summary.reason,
      ...failPayload,
      diagnostics: buildFromLinkAnalyzeDiagnostics({
        extracted,
        supplementalChars,
        finalMaterialChars: summary.materialChars,
        draftPreview: summary.draftPreview,
      }),
    };
  }

  const titleKo =
    summary.titleKo?.trim() || extracted.title?.trim() || "제목 미정";
  const summaryKo = summary.summaryKo?.trim() || "";
  const draftPreview = {
    titleKo,
    summaryKo,
    bodyKo: summary.bodyKo,
  };
  const diagnostics = buildFromLinkAnalyzeDiagnostics({
    extracted,
    supplementalChars,
    finalMaterialChars: summary.materialChars,
    draftPreview,
  });

  const quality = validateFromLinkDraftQuality({
    submittedOriginalUrl,
    titleKo,
    summaryKo,
    bodyKo: summary.bodyKo,
  });
  if (!quality.ok) {
    console.warn("[from-link/analyze] quality failed — diagnostic snapshot", {
      url: submittedOriginalUrl,
      reason: quality.reason,
      failedCheckIds: quality.failedCheckIds ?? [],
      sourceBodyLength: extracted.articleBodyPlain?.length ?? 0,
      sourceParagraphCount: countBodyParagraphs(extracted.articleBodyPlain),
      materialChars: summary.materialChars,
      generatedBodyKoLength: summary.bodyKo.trim().length,
      generatedBodyKoParagraphs: countSubstantiveParagraphs(summary.bodyKo),
      under500Chars: summary.bodyKo.trim().length < MIN_BODY_CHARS,
      under3Paragraphs: countSubstantiveParagraphs(summary.bodyKo) < 3,
      shortArticleReviewRecommended: isShortArticleRecommendedReview(
        summary.bodyKo
      ),
      extractMethod: extracted.articleBodyExtractMethod,
      pageFetchMethod: extracted.pageFetchMethod,
    });
    if (allowShortSourceDraft && diagnostics.canAllowShortSourceDraft) {
      const candidates = await proposeCandidates(
        extracted,
        label,
        summary.bodyKo,
        supplementalText
      );

      const articleDraft: ArticleDraftPayload = {
        synthesizedBodyKo: summary.bodyKo,
        titleKo: summary.titleKo,
        summaryKo: summary.summaryKo,
        bodyOriginal: summary.bodyOriginal,
        summaryOriginal: summary.summaryOriginal,
        contentLanguage: summary.contentLanguage,
        category: summary.category,
        topicKey: summary.topicKey,
        topicLabel: summary.topicLabel,
        shortSourceDraft: true,
      };

      return {
        ok: true,
        linkType,
        linkTypeLabel: label,
        extracted,
        transcript,
        articleDraft,
        candidates,
        diagnostics,
      };
    }

    return {
      ok: false,
      error: quality.reason,
      ...failPayload,
      diagnostics,
    };
  }

  const candidates = await proposeCandidates(
    extracted,
    label,
    summary.bodyKo,
    supplementalText
  );

  const articleDraft: ArticleDraftPayload = {
    synthesizedBodyKo: summary.bodyKo,
    titleKo: summary.titleKo,
    summaryKo: summary.summaryKo,
    bodyOriginal: summary.bodyOriginal,
    summaryOriginal: summary.summaryOriginal,
    contentLanguage: summary.contentLanguage,
    category: summary.category,
    topicKey: summary.topicKey,
    topicLabel: summary.topicLabel,
    shortArticleReview: isShortArticleRecommendedReview(summary.bodyKo),
  };

  return {
    ok: true,
    linkType,
    linkTypeLabel: label,
    extracted,
    transcript,
    articleDraft,
    candidates,
    diagnostics,
  };
}
