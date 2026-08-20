import "server-only";

import { resolvePublisherFromExtracted } from "@/lib/from-link/resolvePublisherSource";
import { resolveSubmittedUrl } from "@/lib/from-link/resolveSubmittedUrl";
import { sanitizeThumbnailUrl } from "@/lib/from-link/sanitizeThumbnail";
import { translateArticlePair } from "@/lib/from-link/translateArticlePair";
import { validateFromLinkDraftQuality } from "@/lib/from-link/validateArticleQuality";
import { buildFromLinkAiReviewNotes } from "@/lib/from-link/fromLinkAiNotes";
import type {
  ArticleDraftPayload,
  DraftCandidate,
  ExtractedPreview,
  LinkType,
} from "@/lib/from-link/types";

export type FromLinkCommitFields = {
  source: string;
  sourceCountry: "KR" | "US";
  sourceSection: string;
  originalUrl: string;
  titleOriginal: string;
  titleKo: string;
  summaryOriginal: string | null;
  summaryKo: string;
  bodyOriginal: string | null;
  bodyKo: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  languageOriginal: "en" | "ko";
  languageTranslated: "en" | "ko";
  aiReviewNotes: string;
  category: string;
};

export type PrepareFromLinkCommitResult =
  | { ok: true; fields: FromLinkCommitFields }
  | { ok: false; error: string; step?: string };

export async function prepareFromLinkCommitFields(input: {
  submittedOriginalUrl: string;
  linkType: LinkType;
  extracted: ExtractedPreview;
  articleDraft: ArticleDraftPayload;
  candidate: DraftCandidate;
  sourceSection?: string;
  aiReviewNotes?: string;
}): Promise<PrepareFromLinkCommitResult> {
  const resolved = resolveSubmittedUrl(input.submittedOriginalUrl);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, step: "resolve_url" };
  }

  const originalUrl = resolved.href;
  const c = input.candidate;
  if (!c.title.trim() || !c.summary_one_line.trim()) {
    return { ok: false, error: "후보에 제목/요약이 없습니다.", step: "candidate_validation" };
  }

  const draft = input.articleDraft;
  const bodyKo = draft.synthesizedBodyKo.trim();
  const titleKo = (draft.titleKo?.trim() || c.title.trim()) || "제목 미정";
  const summaryKo = draft.summaryKo?.trim() || c.summary_one_line.trim() || "";

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
  const aiReviewNotes =
    input.aiReviewNotes ??
    buildFromLinkAiReviewNotes(c, originalUrl, draft.shortSourceDraft);

  return {
    ok: true,
    fields: {
      source: publisher.source,
      sourceCountry: publisher.sourceCountry,
      sourceSection: input.sourceSection ?? `from-link:${input.linkType}`,
      originalUrl,
      titleOriginal: titleEn,
      titleKo,
      summaryOriginal: summaryEn || null,
      summaryKo,
      bodyOriginal: bodyEn || null,
      bodyKo,
      thumbnailUrl,
      publishedAt: input.extracted.publishedAt,
      languageOriginal: isEnglish ? "en" : "ko",
      languageTranslated: isEnglish ? "ko" : "en",
      aiReviewNotes,
      category: "other",
    },
  };
}
