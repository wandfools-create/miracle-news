import "server-only";

import { isSuccessfulBodyExtraction, isAdminUsableBodyExtraction } from "./articleBodyValidation";
import { MIN_USABLE_BODY_CHARS } from "./constants";
import type { ContentLanguage, ExtractedPreview, LinkType } from "./types";
import { detectContentLanguage } from "./detectContentLanguage";
import { fetchArticleBodyFromUrl } from "./fetchPlainText";
import {
  countSubstantiveParagraphs,
  stripUrlsFromArticleText,
} from "./sanitizeArticleText";
import { countBodyParagraphs } from "./server/publisherExtractors/shared";
import { MIN_YOUTUBE_TRANSCRIPT_LENGTH } from "./transcriptDiagnostic";
import {
  formatSupplementalMaterialBlock,
  normalizeSupplementalText,
} from "./supplementalText";
import {
  formatManualPrimaryMaterialBlock,
  manualBodyClearsExtractionGate,
  MIN_VERIFIED_MANUAL_SOURCE_CHARS,
  shouldRetryVerifiedManualAiDecision,
} from "./adminManualPromote";
import { KOREAN_EDITOR_JSON_SYSTEM_PROMPT } from "@/lib/articles/ai/editorPrompt";
import { parseEditorTaxonomy } from "@/lib/articles/articleTaxonomy";
import { chatCompletionJson } from "@/lib/openai/chatCompletionJson";
import { checkOpenAiEnv } from "@/lib/openai/env";

export type SummarizeDraftPreview = {
  titleKo: string;
  summaryKo: string;
  bodyKo: string;
};

export type SummarizeForArticleResult =
  | {
      ok: true;
      materialChars: number;
      /** Full Korean article body (distinct from summary). */
      bodyKo: string;
      titleKo: string | null;
      summaryKo: string | null;
      bodyOriginal: string | null;
      summaryOriginal: string | null;
      contentLanguage: ContentLanguage;
      category: string;
      topicKey: string | null;
      topicLabel: string | null;
      editorialPriority: string;
    }
  | {
      ok: false;
      reason: string;
      materialChars: number;
      draftPreview?: SummarizeDraftPreview;
    };

const MIN_MATERIAL_WITH_AI = 120;
const MIN_SOURCE_MATERIAL_CHARS = 400;

function joinMaterial(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

async function buildSourceMaterial(
  linkType: LinkType,
  pageUrl: string,
  extracted: ExtractedPreview,
  supplementalText: string | null,
  preferManualSourceBody = false
): Promise<{ material: string; usedTranscript: boolean }> {
  const supplementalBlock = supplementalText
    ? preferManualSourceBody
      ? formatManualPrimaryMaterialBlock(supplementalText)
      : formatSupplementalMaterialBlock(supplementalText)
    : null;

  if (linkType === "youtube") {
    const transcript = extracted.youtubeTranscript?.trim() || "";
    const hasTranscript = transcript.length > 0;
    const hasSupplemental = Boolean(supplementalText);

    if (!hasTranscript && !hasSupplemental) {
      return { usedTranscript: false, material: "" };
    }

    return {
      usedTranscript: hasTranscript,
      material: joinMaterial([
        `SOURCE_URL_FIXED: ${extracted.submittedOriginalUrl}`,
        extracted.title ? `제목(참고): ${extracted.title}` : null,
        extracted.author ? `채널: ${extracted.author}` : null,
        hasTranscript
          ? `[영상 자막 — 근거 자료]`
          : null,
        hasTranscript ? transcript : null,
        supplementalBlock,
      ]),
    };
  }

  let articleBody = extracted.articleBodyPlain?.trim() ?? "";
  const extractMethod = extracted.articleBodyExtractMethod ?? "unknown";

  // Manual primary: skip refetch noise; use paste as the main material.
  if (preferManualSourceBody && supplementalText) {
    const extractedRef =
      articleBody.length >= MIN_USABLE_BODY_CHARS
        ? `[참고·자동추출 — 수동 원문 우선]\n${articleBody.slice(0, 4000)}`
        : null;
    return {
      usedTranscript: false,
      material: joinMaterial([
        `SOURCE_URL_FIXED: ${extracted.submittedOriginalUrl}`,
        extracted.title ? `제목(참고): ${extracted.title}` : null,
        supplementalBlock,
        extractedRef,
        extracted.author ? `작성/채널: ${extracted.author}` : null,
      ]).trim(),
    };
  }

  if (
    (linkType === "article" ||
      linkType === "x" ||
      linkType === "instagram") &&
    articleBody.length < MIN_USABLE_BODY_CHARS
  ) {
    console.log("[from-link/summarize] re-fetching article body", {
      url: extracted.submittedOriginalUrl,
      currentLength: articleBody.length,
      method: extractMethod,
    });
    const refetched = await fetchArticleBodyFromUrl(pageUrl, 20_000);
    if (refetched.text && refetched.text.length > articleBody.length) {
      articleBody = refetched.text;
      console.log("[from-link/summarize] refetch improved body", {
        url: extracted.submittedOriginalUrl,
        newLength: articleBody.length,
        method: refetched.method,
      });
    } else {
      console.warn("[from-link/summarize] refetch did not improve body", {
        url: extracted.submittedOriginalUrl,
        step: "refetch-article-body",
        refetchMethod: refetched.method,
        refetchLength: refetched.text?.length ?? 0,
      });
    }
  }

  const material = joinMaterial([
    `SOURCE_URL_FIXED: ${extracted.submittedOriginalUrl}`,
    extracted.title ? `제목(참고): ${extracted.title}` : null,
    articleBody.length >= 200
      ? `[기사 본문 — 추출: ${extractMethod}, ${articleBody.length}자]\n${articleBody}`
      : null,
    extracted.author ? `작성/채널: ${extracted.author}` : null,
    supplementalBlock,
  ]);

  return { material: material.trim(), usedTranscript: false };
}

async function summarizeWithOpenAi(input: {
  linkTypeLabel: string;
  pageUrl: string;
  isVideoContext: boolean;
  usedTranscript: boolean;
  material: string;
  materialChars: number;
  sourceBodyLength: number;
  sourceParagraphCount: number;
  extractMethod: string | null;
  verifiedManualSourceBody: boolean;
  manualSourceBodyChars: number;
}): Promise<SummarizeForArticleResult | null> {
  const env = checkOpenAiEnv();
  if (!env.ok) {
    console.error("[summarizeForArticle] OPENAI env", env);
    return null;
  }

  const MATERIAL_TRUNCATE = 28_000;
  const truncateBefore = input.material.length;
  const material = input.material.slice(0, MATERIAL_TRUNCATE);
  const truncateAfter = material.length;

  type ParsedDraft = {
    usable: boolean;
    reason_ko: string | null;
    title_ko: string;
    summary_ko: string;
    article_body_ko: string;
    article_body_original: string;
    contentLanguage: ContentLanguage;
    category: string;
    topicKey: string | null;
    topicLabel: string | null;
    editorialPriority: string;
  };

  const parseCompletion = (
    data: Record<string, unknown>,
    materialForLang: string
  ): ParsedDraft => {
    const o = data as {
      usable?: unknown;
      reason_ko?: unknown;
      source_language?: unknown;
      title_ko?: unknown;
      summary_ko?: unknown;
      article_body_ko?: unknown;
      article_summary_ko?: unknown;
      article_body_original?: unknown;
      article_summary_original?: unknown;
    };

    const article_body_ko = stripUrlsFromArticleText(
      typeof o.article_body_ko === "string"
        ? o.article_body_ko
        : typeof o.article_summary_ko === "string"
          ? o.article_summary_ko
          : ""
    );
    const summary_ko = stripUrlsFromArticleText(
      typeof o.summary_ko === "string" ? o.summary_ko : ""
    );
    const title_ko =
      typeof o.title_ko === "string" ? stripUrlsFromArticleText(o.title_ko) : "";
    const article_body_original = stripUrlsFromArticleText(
      typeof o.article_body_original === "string"
        ? o.article_body_original
        : typeof o.article_summary_original === "string"
          ? o.article_summary_original
          : ""
    );

    const langRaw = String(o.source_language || "").toLowerCase();
    const contentLanguage: ContentLanguage =
      langRaw === "en" || langRaw === "ko"
        ? langRaw
        : detectContentLanguage(materialForLang);

    const taxonomy = parseEditorTaxonomy(data);

    return {
      usable: o.usable === true,
      reason_ko:
        typeof o.reason_ko === "string" && o.reason_ko.trim()
          ? o.reason_ko.trim()
          : null,
      title_ko,
      summary_ko,
      article_body_ko,
      article_body_original,
      contentLanguage,
      category: taxonomy.category,
      topicKey: taxonomy.topicKey,
      topicLabel: taxonomy.topicLabel,
      editorialPriority: taxonomy.editorialPriority,
    };
  };

  const logDraft = (
    attempt: "first" | "verified_manual_retry",
    draft: ParsedDraft
  ): void => {
    console.info("[from-link/summarize] OpenAI 응답", {
      url: input.pageUrl,
      attempt,
      usable: draft.usable,
      reason_ko: draft.reason_ko,
      generatedBodyLength: draft.article_body_ko.length,
      generatedParagraphCount: countSubstantiveParagraphs(
        draft.article_body_ko
      ),
      titleKoLength: draft.title_ko.length,
      summaryKoLength: draft.summary_ko.length,
      sourceBodyLength: input.sourceBodyLength,
      sourceParagraphCount: input.sourceParagraphCount,
      bodyPreview300: draft.article_body_ko.slice(0, 300),
    });
  };

  const toSuccess = (draft: ParsedDraft): SummarizeForArticleResult => ({
    ok: true,
    materialChars: input.materialChars,
    bodyKo: draft.article_body_ko,
    titleKo: draft.title_ko,
    summaryKo: draft.summary_ko,
    bodyOriginal:
      draft.contentLanguage === "en" && draft.article_body_original
        ? draft.article_body_original
        : null,
    summaryOriginal:
      draft.contentLanguage === "en"
        ? draft.article_body_original?.slice(0, 500) || null
        : null,
    contentLanguage: draft.contentLanguage,
    category: draft.category,
    topicKey: draft.topicKey,
    topicLabel: draft.topicLabel,
    editorialPriority: draft.editorialPriority,
  });

  const fail = (
    reason: string,
    draftPreview?: SummarizeDraftPreview
  ): SummarizeForArticleResult => ({
    ok: false,
    reason,
    materialChars: input.materialChars,
    draftPreview,
  });

  console.info("[from-link/summarize] OpenAI 호출 직전 원문", {
    url: input.pageUrl,
    extractMethod: input.extractMethod,
    sourceBodyLength: input.sourceBodyLength,
    sourceParagraphCount: input.sourceParagraphCount,
    truncateBeforeLength: truncateBefore,
    truncateAfterLength: truncateAfter,
    truncated: truncateBefore > truncateAfter,
    materialPreview300: material.slice(0, 300),
  });

  const requestPayload = {
    linkType: input.linkTypeLabel,
    source_url: input.pageUrl,
    isVideoContext: input.isVideoContext,
    usedTranscript: input.usedTranscript,
    material,
    source_material_status: input.verifiedManualSourceBody
      ? "admin_verified_manual_full_text"
      : "automatic_or_supplemental",
    manual_source_body_chars: input.manualSourceBodyChars,
  };

  const firstCompletion = await chatCompletionJson<Record<string, unknown>>({
    step: "from_link_summarize",
    system: KOREAN_EDITOR_JSON_SYSTEM_PROMPT,
    user: JSON.stringify(requestPayload),
  });

  if (!firstCompletion.ok) {
    console.error("[summarizeForArticle] OpenAI failed", {
      url: input.pageUrl,
      attempt: "first",
      error: firstCompletion.error,
      step: firstCompletion.step,
      sourceBodyLength: input.sourceBodyLength,
      sourceParagraphCount: input.sourceParagraphCount,
      truncateBeforeLength: truncateBefore,
      truncateAfterLength: truncateAfter,
    });
    return null;
  }

  let draft = parseCompletion(firstCompletion.data, material);
  logDraft("first", draft);

  if (
    shouldRetryVerifiedManualAiDecision({
      manualBodyChars: input.manualSourceBodyChars,
      preferManualSourceBody: input.verifiedManualSourceBody,
      usable: draft.usable,
      reason: draft.reason_ko,
    })
  ) {
    const retryCompletion = await chatCompletionJson<Record<string, unknown>>({
      step: "from_link_summarize_verified_manual_retry",
      system: `${KOREAN_EDITOR_JSON_SYSTEM_PROMPT}\nThe administrator pasted at least 400 characters of verified article body. The automatic extractor's empty body is irrelevant. Re-evaluate the pasted body itself and do not return usable=false merely for insufficient length. Still reject non-article, promotional, unrelated, or factually unusable material.`,
      user: JSON.stringify({
        ...requestPayload,
        retry_reason: draft.reason_ko,
      }),
    });
    if (!retryCompletion.ok) {
      console.error("[summarizeForArticle] verified manual retry failed", {
        url: input.pageUrl,
        error: retryCompletion.error,
        step: retryCompletion.step,
      });
      return null;
    }
    draft = parseCompletion(retryCompletion.data, material);
    logDraft("verified_manual_retry", draft);
  }

  if (!draft.usable) {
    return fail(
      draft.reason_ko ||
        `OpenAI usable=false: 모델이 자료로 기사 본문을 쓸 수 없다고 판단함 (원문 ${input.sourceBodyLength}자 / ${input.sourceParagraphCount}문단, 생성본문 ${draft.article_body_ko.length}자 / ${countSubstantiveParagraphs(draft.article_body_ko)}문단)`
    );
  }

  if (!draft.title_ko || !draft.summary_ko || !draft.article_body_ko) {
    return fail(
      `OpenAI 응답 필드 누락: title=${draft.title_ko.length}자 summary=${draft.summary_ko.length}자 body=${draft.article_body_ko.length}자 (원문 ${input.sourceBodyLength}자 / ${input.sourceParagraphCount}문단)`
    );
  }

  return toSuccess(draft);
}

export type SummarizeForArticleOptions = {
  supplementalTextRaw?: string | null;
  /**
   * Admin promote: skip the 400-char source floor (still require MIN_MATERIAL_WITH_AI).
   * Does not invent content or length-expand.
   */
  allowShortSourceMaterial?: boolean;
  /** Explicit admin force — short manual paste may clear extraction gate. */
  adminForceCreate?: boolean;
  /** Prefer pasted body over auto-extracted text in AI material. */
  preferManualSourceBody?: boolean;
};

export async function measureFromLinkSourceMaterial(
  linkType: LinkType,
  pageUrl: string,
  extracted: ExtractedPreview,
  supplementalTextRaw?: string | null,
  preferManualSourceBody = false
): Promise<number> {
  const supplementalText = normalizeSupplementalText(supplementalTextRaw);
  const { material } = await buildSourceMaterial(
    linkType,
    pageUrl,
    extracted,
    supplementalText,
    preferManualSourceBody
  );
  return material.length;
}

export async function summarizeForArticle(
  linkType: LinkType,
  pageUrl: string,
  extracted: ExtractedPreview,
  linkTypeLabel: string,
  options?: SummarizeForArticleOptions
): Promise<SummarizeForArticleResult> {
  const supplementalText = normalizeSupplementalText(
    options?.supplementalTextRaw
  );
  const allowShortSourceMaterial = options?.allowShortSourceMaterial === true;
  const adminForceCreate = options?.adminForceCreate === true;
  const preferManualSourceBody =
    options?.preferManualSourceBody === true ||
    (Boolean(supplementalText) && adminForceCreate);
  if (linkType === "video") {
    return {
      ok: false,
      materialChars: 0,
      reason:
        "직접 영상 파일 링크는 대본·자막 없이 내용을 요약할 수 없어 기사 초안으로 쓸 수 없습니다. 기사 페이지나 YouTube 등 설명·본문이 있는 링크를 사용해 주세요.",
    };
  }

  const isVideoContext = linkType === "youtube";

  if (
    linkType === "article" ||
    linkType === "x" ||
    linkType === "instagram"
  ) {
    const extractionOk =
      isSuccessfulBodyExtraction(extracted) ||
      manualBodyClearsExtractionGate({
        manualBodyChars: supplementalText?.length ?? 0,
        adminForceCreate,
        minUsableChars: MIN_USABLE_BODY_CHARS,
      }) ||
      (allowShortSourceMaterial && isAdminUsableBodyExtraction(extracted));
    if (!extractionOk) {
      console.warn("[from-link/summarize] blocked — body extraction failed", {
        url: extracted.submittedOriginalUrl,
        step: "body-extraction-gate",
        articleBodyLength: extracted.articleBodyPlain?.length ?? 0,
        extractMethod: extracted.articleBodyExtractMethod,
        extractSuccess: extracted.articleBodyExtractSuccess,
        supplementalLength: supplementalText?.length ?? 0,
        allowShortSourceMaterial,
        adminForceCreate,
      });
      return {
        ok: false,
        materialChars: 0,
        reason:
          "본문 추출 실패: 실제 기사 본문을 확보하지 못했습니다. 메타 설명만으로는 생성하지 않습니다. 원문 보강 텍스트를 붙이거나 다른 URL을 시도해 주세요.",
      };
    }
  }

  if (linkType === "youtube") {
    const transcriptLen = extracted.youtubeTranscript?.trim().length ?? 0;
    const supplementalLen = supplementalText?.length ?? 0;
    if (
      transcriptLen + supplementalLen < MIN_YOUTUBE_TRANSCRIPT_LENGTH &&
      supplementalLen < MIN_YOUTUBE_TRANSCRIPT_LENGTH
    ) {
      return {
        ok: false,
        materialChars: 0,
        reason:
          transcriptLen === 0
            ? "영상 자막을 찾지 못했습니다. 원문 보강 텍스트를 붙이거나 자막이 있는 영상을 사용해 주세요."
            : `영상 자막이 너무 짧습니다 (${transcriptLen}자). 보강 텍스트를 추가하거나 더 긴 자막이 있는 영상을 사용해 주세요.`,
      };
    }
  }

  const { material, usedTranscript } = await buildSourceMaterial(
    linkType,
    pageUrl,
    extracted,
    supplementalText,
    preferManualSourceBody
  );

  const materialChars = material.length;
  const materialParagraphs = countBodyParagraphs(material);
  const articleBodyParagraphs = countBodyParagraphs(
    extracted.articleBodyPlain
  );

  console.info("[from-link/summarize] material before AI / insufficiency checks", {
    url: extracted.submittedOriginalUrl,
    materialChars,
    materialParagraphs,
    sourceBodyLength: extracted.articleBodyPlain?.length ?? 0,
    sourceParagraphCount: articleBodyParagraphs,
    extractMethod: extracted.articleBodyExtractMethod,
    pageFetchMethod: extracted.pageFetchMethod,
    supplementalLength: supplementalText?.length ?? 0,
  });

  if (linkType === "youtube" && !usedTranscript && !supplementalText) {
    return {
      ok: false,
      materialChars,
      reason:
        "영상 자막·보강 텍스트가 없어 요약할 수 없습니다. 자막이 있거나 보강 텍스트를 붙여 주세요.",
    };
  }

  if (material.length < MIN_MATERIAL_WITH_AI) {
    console.warn("[from-link/summarize] 원문 자료 부족 판정 (min ai)", {
      url: extracted.submittedOriginalUrl,
      materialLength: material.length,
      materialParagraphs,
      sourceBodyLength: extracted.articleBodyPlain?.length ?? 0,
      sourceParagraphCount: articleBodyParagraphs,
      minRequired: MIN_MATERIAL_WITH_AI,
      extractMethod: extracted.articleBodyExtractMethod,
      step: "material-length-check",
    });
    return {
      ok: false,
      materialChars,
      reason: `원문 자료 부족 판정: AI 최소 길이 ${MIN_MATERIAL_WITH_AI}자 미달 (현재 material ${material.length}자, 추출본문 ${extracted.articleBodyPlain?.length ?? 0}자 / ${articleBodyParagraphs}문단)`,
    };
  }

  if (
    material.length < MIN_SOURCE_MATERIAL_CHARS &&
    linkType !== "youtube" &&
    (supplementalText?.length ?? 0) < MIN_SOURCE_MATERIAL_CHARS &&
    !allowShortSourceMaterial
  ) {
    console.warn("[from-link/summarize] 원문 자료 부족 판정 (source min)", {
      url: extracted.submittedOriginalUrl,
      materialLength: material.length,
      materialParagraphs,
      sourceBodyLength: extracted.articleBodyPlain?.length ?? 0,
      sourceParagraphCount: articleBodyParagraphs,
      minRequired: MIN_SOURCE_MATERIAL_CHARS,
      extractMethod: extracted.articleBodyExtractMethod,
      step: "source-material-min-chars",
    });
    return {
      ok: false,
      materialChars,
      reason: `원문 자료 부족 판정: 소스 최소 길이 ${MIN_SOURCE_MATERIAL_CHARS}자 미달 (현재 material ${material.length}자, 추출본문 ${extracted.articleBodyPlain?.length ?? 0}자 / ${articleBodyParagraphs}문단)`,
    };
  }

  const aiPayload = {
    linkTypeLabel,
    pageUrl: extracted.submittedOriginalUrl,
    isVideoContext,
    usedTranscript,
    material,
    materialChars,
    sourceBodyLength: extracted.articleBodyPlain?.length ?? 0,
    sourceParagraphCount: articleBodyParagraphs,
    extractMethod: extracted.articleBodyExtractMethod ?? null,
    verifiedManualSourceBody:
      preferManualSourceBody &&
      (supplementalText?.length ?? 0) >= MIN_VERIFIED_MANUAL_SOURCE_CHARS,
    manualSourceBodyChars: supplementalText?.length ?? 0,
  };

  const openAiHint = checkOpenAiEnv();
  const keyHint =
    openAiHint.ok === false
      ? openAiHint.error
      : "OpenAI 호출이 실패했습니다. 서버 콘솔의 [openai/from_link_summarize] 로그를 확인하세요.";

  if (linkType === "youtube") {
    const ai = await summarizeWithOpenAi(aiPayload);
    if (ai !== null) return ai;
    return {
      ok: false,
      materialChars,
      reason: `영상 자막을 바탕으로 기사 본문을 작성하지 못했습니다. ${keyHint}`,
    };
  }

  const ai = await summarizeWithOpenAi(aiPayload);
  if (ai) return ai;

  return {
    ok: false,
    materialChars,
    reason: `OPENAI_API_KEY가 필요하며, 충분한 원문 자료가 있어야 기사 본문을 생성할 수 있습니다. ${keyHint}`,
  };
}
