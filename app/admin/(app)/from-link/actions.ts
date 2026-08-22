"use server";

import { findExistingArticleByOriginalUrl } from "@/lib/articles/findExistingArticleByOriginalUrl";
import { insertReviewQueueArticle } from "@/lib/articles/insertReviewQueueArticle";
import { analyzeFromLinkCore } from "@/lib/from-link/analyzeFromLinkCore";
import { buildFromLinkAiReviewNotes } from "@/lib/from-link/fromLinkAiNotes";
import { prepareFromLinkCommitFields } from "@/lib/from-link/prepareFromLinkCommitFields";
import { isShortArticleRecommendedReview } from "@/lib/from-link/validateArticleQuality";
import { resolveSubmittedUrl } from "@/lib/from-link/resolveSubmittedUrl";
import { translateArticlePair } from "@/lib/from-link/translateArticlePair";
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

export async function analyzeFromLink(
  urlRaw: string,
  supplementalTextRaw?: string | null,
  options?: AnalyzeFromLinkOptions
): Promise<AnalyzeFromLinkResult> {
  return analyzeFromLinkCore(urlRaw, supplementalTextRaw, options);
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
  const prepared = await prepareFromLinkCommitFields({
    submittedOriginalUrl: input.submittedOriginalUrl,
    linkType: input.linkType,
    extracted: input.extracted,
    articleDraft: input.articleDraft,
    candidate: input.candidate,
    aiReviewNotes: buildFromLinkAiReviewNotes(
      input.candidate,
      input.submittedOriginalUrl.trim(),
      {
        shortSourceDraft: input.articleDraft.shortSourceDraft === true,
        shortArticleReview:
          input.articleDraft.shortArticleReview === true ||
          isShortArticleRecommendedReview(
            input.articleDraft.synthesizedBodyKo
          ),
      }
    ),
  });

  if (!prepared.ok) {
    return {
      ok: false,
      error: prepared.error,
      step: prepared.step,
    };
  }

  const f = prepared.fields;

  const result = await insertReviewQueueArticle({
    skipOriginalUrlDuplicateCheck: true,
    source: f.source,
    originalUrl: f.originalUrl,
    canonicalUrl: null,
    titleOriginal: f.titleOriginal,
    titleKo: f.titleKo,
    summaryOriginal: f.summaryOriginal,
    summaryKo: f.summaryKo,
    bodyOriginal: f.bodyOriginal,
    bodyKo: f.bodyKo,
    publishedAt: f.publishedAt,
    aiReviewNotes: f.aiReviewNotes,
    category: f.category,
    topicKey: f.topicKey,
    topicLabel: f.topicLabel,
    thumbnailUrl: f.thumbnailUrl,
    sourceSection: f.sourceSection,
    sourceCountry: f.sourceCountry,
    languageOriginal: f.languageOriginal,
    languageTranslated: f.languageTranslated,
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
