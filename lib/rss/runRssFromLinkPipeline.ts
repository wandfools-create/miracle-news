import "server-only";

import { analyzeFromLinkCore } from "@/lib/from-link/analyzeFromLinkCore";
import {
  prepareFromLinkCommitFields,
  type FromLinkCommitFields,
} from "@/lib/from-link/prepareFromLinkCommitFields";
import {
  categorizeEnrichFailure,
  type RssEnrichFailureCategory,
} from "@/lib/rss/enrichFailure";
import {
  RSS_AI_REVIEW_NOTE_ENRICHED,
  RSS_SOURCE_SECTION_ENRICHED,
} from "@/lib/rss/feedSources";
import type { DraftCandidate } from "@/lib/from-link/types";

export type RssFromLinkPipelineResult =
  | { ok: true; fields: FromLinkCommitFields }
  | {
      ok: false;
      step: string;
      error: string;
      category: RssEnrichFailureCategory;
      categoryLabel: string;
    };

function pickAutoCandidate(
  candidates: DraftCandidate[],
  titleKo: string,
  summaryKo: string
): DraftCandidate {
  const first = candidates[0];
  if (first?.title?.trim() && first.summary_one_line?.trim()) {
    return first;
  }
  return {
    id: "rss-auto",
    title: titleKo,
    summary_one_line: summaryKo.slice(0, 240) || titleKo,
    angle: "RSS 자동 보강",
  };
}

function pipelineFailure(
  step: string,
  error: string
): Extract<RssFromLinkPipelineResult, { ok: false }> {
  const { category, categoryLabel } = categorizeEnrichFailure(step, error);
  return { ok: false, step, error, category, categoryLabel };
}

/** from-link analyze → translate → quality gates (no DB write). */
export async function runRssFromLinkPipeline(input: {
  originalUrl: string;
  /** Override default RSS auto-collect review notes. */
  aiReviewNotes?: string;
  /**
   * Admin collection-candidate 「기사 만들기」.
   * Soft-fails length-only quality; RSS auto must leave this false.
   */
  adminArticleCreate?: boolean;
}): Promise<RssFromLinkPipelineResult> {
  const originalUrl = input.originalUrl.trim();
  const adminArticleCreate = input.adminArticleCreate === true;

  const analyzed = await analyzeFromLinkCore(originalUrl, null, {
    allowShortSourceDraft: false,
    adminArticleCreate,
  });

  if (!analyzed.ok) {
    return pipelineFailure("analyze_from_link", analyzed.error);
  }

  const titleKo =
    analyzed.articleDraft.titleKo?.trim() ||
    analyzed.extracted.title?.trim() ||
    "제목 미정";
  const summaryKo = analyzed.articleDraft.summaryKo?.trim() || "";

  const candidate = pickAutoCandidate(
    analyzed.candidates,
    titleKo,
    summaryKo
  );

  const prepared = await prepareFromLinkCommitFields({
    submittedOriginalUrl: originalUrl,
    linkType: analyzed.linkType,
    extracted: {
      ...analyzed.extracted,
      submittedOriginalUrl: originalUrl,
    },
    articleDraft: analyzed.articleDraft,
    candidate,
    sourceSection: RSS_SOURCE_SECTION_ENRICHED,
    aiReviewNotes:
      input.aiReviewNotes?.trim() ||
      [
        RSS_AI_REVIEW_NOTE_ENRICHED,
        `[RSS 자동 수집] ${new Date().toISOString()}`,
        `편집 각도: ${candidate.angle}`,
      ].join("\n"),
  });

  if (!prepared.ok) {
    return pipelineFailure(
      prepared.step ?? "prepare_commit",
      prepared.error
    );
  }

  return { ok: true, fields: prepared.fields };
}
