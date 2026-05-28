"use server";

import { findExistingArticleByOriginalUrl } from "@/lib/articles/findExistingArticleByOriginalUrl";
import { insertReviewQueueArticle } from "@/lib/articles/insertReviewQueueArticle";
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
import { resolvePublisherFromExtracted } from "@/lib/from-link/resolvePublisherSource";
import { translateArticlePair } from "@/lib/from-link/translateArticlePair";
import { isSuccessfulBodyExtraction } from "@/lib/from-link/articleBodyValidation";
import { MIN_USABLE_BODY_CHARS } from "@/lib/from-link/constants";
import { normalizeSupplementalText } from "@/lib/from-link/supplementalText";
import type { FromLinkQualityCheckItem } from "@/lib/from-link/fromLinkDiagnostics";
import { validateFromLinkDraftQuality } from "@/lib/from-link/validateArticleQuality";
import {
  DUPLICATE_LINK_MESSAGE,
  type AnalyzeFromLinkOptions,
  type AnalyzeFromLinkResult,
  type CommitFromLinkDraftsResult,
  type CommitFromLinkFailure,
  type CommitFromLinkResult,
} from "@/lib/from-link/actionTypes";
import type {
  ArticleDraftPayload,
  DraftCandidate,
  ExtractedPreview,
  LinkType,
} from "@/lib/from-link/types";

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

export async function analyzeFromLink(
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
            detail: "CNN 링크는 메타 설명만으로 생성하지 않고 본문 추출 성공 시에만 진행",
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
    return {
      ok: false,
      error:
        "본문 추출 실패: 실제 기사 본문을 가져오지 못했습니다. og:description만으로는 진행하지 않습니다. 원문 보강 텍스트를 붙이거나 다른 URL을 시도해 주세요.",
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
    if (
      allowShortSourceDraft &&
      diagnostics.canAllowShortSourceDraft
    ) {
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

function buildFromLinkAiReviewNotes(
  candidate: DraftCandidate,
  submittedOriginalUrl: string,
  shortSourceDraft?: boolean
): string {
  return [
    "[from-link 후보 메타]",
    `편집 각도: ${candidate.angle}`,
    `한 줄 요약(후보): ${candidate.summary_one_line}`,
    `입력 URL(고정): ${submittedOriginalUrl}`,
    shortSourceDraft
      ? "[경고] 짧은 원문 기반 초안 — 생성 본문이 일반 품질 기준(900자·5문단) 미만일 수 있음. 원문·본문을 반드시 검토하세요."
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function duplicateLinkFailure(articleId: string): CommitFromLinkFailure {
  return {
    ok: false,
    error: DUPLICATE_LINK_MESSAGE,
    code: "duplicate_link",
    duplicateArticleId: articleId,
    step: "duplicate_check_original_url",
  };
}

async function assertNoExistingArticleForUrl(
  submittedOriginalUrl: string
): Promise<CommitFromLinkFailure | null> {
  const found = await findExistingArticleByOriginalUrl(submittedOriginalUrl);
  if (!found.ok) {
    return {
      ok: false,
      error: found.error,
      step: "duplicate_check_original_url",
    };
  }
  if (found.articleId) {
    return duplicateLinkFailure(found.articleId);
  }
  return null;
}

function formatInsertFailure(
  context: string,
  result: Extract<
    Awaited<ReturnType<typeof insertReviewQueueArticle>>,
    { ok: false }
  >
): CommitFromLinkFailure {
  const lines = [
    `${context}: ${result.error}`,
    result.step ? `실패 단계: ${result.step}` : null,
    result.code ? `코드: ${result.code}` : null,
    result.hint ? `안내: ${result.hint}` : null,
    result.details ? `상세: ${result.details}` : null,
  ].filter(Boolean);

  console.error(`[commitFromLinkDraft] ${context} insert failed`, result);

  return {
    ok: false,
    error: lines.join("\n"),
    step: result.step,
    code: result.code,
    hint: result.hint,
    details: result.details,
    duplicateArticleId: result.duplicateArticleId,
  };
}

async function commitFromLinkDraft(input: {
  submittedOriginalUrl: string;
  linkType: LinkType;
  extracted: ExtractedPreview;
  articleDraft: ArticleDraftPayload;
  candidate: DraftCandidate;
}): Promise<CommitFromLinkResult> {
  const submittedOriginalUrl = input.submittedOriginalUrl.trim();
  const resolved = resolveSubmittedUrl(submittedOriginalUrl);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const originalUrl = resolved.href;

  const c = input.candidate;
  if (!c.title.trim() || !c.summary_one_line.trim()) {
    return { ok: false, error: "선택한 후보에 제목/요약이 없습니다." };
  }

  const draft = input.articleDraft;
  const bodyKo = draft.synthesizedBodyKo.trim();
  const titleKo = (draft.titleKo?.trim() || c.title.trim()) || "제목 미정";
  const summaryKo =
    draft.summaryKo?.trim() || c.summary_one_line.trim() || "";

  if (!draft.shortSourceDraft) {
    const quality = validateFromLinkDraftQuality({
      submittedOriginalUrl: originalUrl,
      titleKo,
      summaryKo,
      bodyKo,
    });
    if (!quality.ok) {
      return { ok: false, error: quality.reason, step: "quality_check" };
    }
  }

  const isEnglish = draft.contentLanguage === "en";
  const extractedTitle = input.extracted.title?.trim() || "";

  let titleEn = draft.titleEn?.trim() || "";
  let summaryEn = draft.summaryEn?.trim() || "";
  let bodyEn = draft.bodyEn?.trim() || "";

  if (!isEnglish) {
    if (!titleEn || !summaryEn || !bodyEn) {
      const translated = await translateArticlePair({
        direction: "ko_to_en",
        title: titleKo,
        summary: summaryKo,
        body: bodyKo,
      });
      if (!translated.ok) {
        return {
          ok: false,
          error: `영어 번역에 실패했습니다. ${translated.error}`,
          step: "translate_ko_to_en",
        };
      }
      titleEn = translated.title;
      summaryEn = translated.summary;
      bodyEn = translated.body;
    }
  } else {
    titleEn =
      extractedTitle ||
      draft.bodyOriginal?.trim().split(/\n/)[0]?.slice(0, 200) ||
      titleKo;
    summaryEn =
      draft.summaryOriginal?.trim().slice(0, 1200) ||
      input.extracted.description?.trim().slice(0, 1200) ||
      summaryKo;
    bodyEn =
      draft.bodyOriginal?.trim().slice(0, 12_000) ||
      input.extracted.articleBodyPlain?.trim().slice(0, 12_000) ||
      "";
  }

  if (!titleEn.trim()) {
    return {
      ok: false,
      error: "영어 제목을 확보하지 못했습니다.",
      step: "bilingual_validation",
    };
  }

  const publisher = resolvePublisherFromExtracted(
    originalUrl,
    input.extracted,
    input.linkType
  );

  const thumbnailUrl = sanitizeThumbnailUrl(input.extracted.thumbnailUrl);

  const result = await insertReviewQueueArticle({
    skipOriginalUrlDuplicateCheck: true,
    source: publisher.source,
    originalUrl,
    canonicalUrl: null,
    titleOriginal: titleEn,
    titleKo,
    summaryOriginal: summaryEn || null,
    summaryKo,
    bodyOriginal: bodyEn || null,
    bodyKo,
    publishedAt: input.extracted.publishedAt,
    aiReviewNotes: buildFromLinkAiReviewNotes(
      c,
      originalUrl,
      draft.shortSourceDraft
    ),
    category: "other",
    thumbnailUrl,
    sourceSection: `from-link:${input.linkType}`,
    sourceCountry: publisher.sourceCountry,
    languageOriginal: isEnglish ? "en" : "ko",
    languageTranslated: isEnglish ? "ko" : "en",
  });

  if (!result.ok) {
    if (result.duplicateArticleId) {
      return duplicateLinkFailure(result.duplicateArticleId);
    }
    return formatInsertFailure("검토 대기 저장", result);
  }

  return { ok: true, articleId: result.articleId };
}

const MAX_BATCH = 20;

export async function commitFromLinkDrafts(input: {
  submittedOriginalUrl: string;
  linkType: LinkType;
  extracted: ExtractedPreview;
  articleDraft: ArticleDraftPayload;
  candidates: DraftCandidate[];
}): Promise<CommitFromLinkDraftsResult> {
  if (!input.candidates.length) {
    return { ok: false, error: "저장할 후보를 하나 이상 선택해 주세요." };
  }
  if (input.candidates.length > MAX_BATCH) {
    return {
      ok: false,
      error: `한 번에 저장할 후보는 ${MAX_BATCH}개 이하로 제한합니다.`,
    };
  }

  const resolved = resolveSubmittedUrl(input.submittedOriginalUrl);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  const originalUrl = resolved.href;

  const duplicate = await assertNoExistingArticleForUrl(originalUrl);
  if (duplicate) {
    return duplicate;
  }

  let articleDraft = input.articleDraft;

  if (articleDraft.contentLanguage === "ko") {
    const hasEn =
      articleDraft.titleEn?.trim() &&
      articleDraft.summaryEn?.trim() &&
      articleDraft.bodyEn?.trim();
    if (!hasEn) {
      const bodyKo = articleDraft.synthesizedBodyKo.trim();
      const titleKo =
        articleDraft.titleKo?.trim() ||
        input.extracted.title?.trim() ||
        "제목 미정";
      const summaryKo = articleDraft.summaryKo?.trim() || "";
      const translated = await translateArticlePair({
        direction: "ko_to_en",
        title: titleKo,
        summary: summaryKo,
        body: bodyKo,
      });
      if (!translated.ok) {
        return {
          ok: false,
          error: `영어 번역에 실패했습니다. ${translated.error}`,
          step: "translate_ko_to_en",
        };
      }
      articleDraft = {
        ...articleDraft,
        titleEn: translated.title,
        summaryEn: translated.summary,
        bodyEn: translated.body,
      };
    }
  }

  const articleIds: string[] = [];

  for (const candidate of input.candidates) {
    const one = await commitFromLinkDraft({
      submittedOriginalUrl: originalUrl,
      linkType: input.linkType,
      extracted: {
        ...input.extracted,
        submittedOriginalUrl: originalUrl,
      },
      articleDraft,
      candidate,
    });

    if (!one.ok) {
      const prefix =
        articleIds.length > 0
          ? `(후보 "${candidate.title}" 저장 실패 · 이전 ${articleIds.length}건은 저장됨)\n`
          : `(후보 "${candidate.title}" 저장 실패)\n`;
      console.error("[commitFromLinkDrafts] batch stopped", one);
      return {
        ...one,
        error: `${prefix}${one.error}`,
        articleIds: articleIds.length > 0 ? articleIds : undefined,
      };
    }

    articleIds.push(one.articleId);
  }

  return { ok: true, articleIds };
}
