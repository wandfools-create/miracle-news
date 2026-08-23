import type { FromLinkAnalyzeDiagnostics } from "./fromLinkDiagnostics";
import type { TranscriptDiagnostic } from "./transcriptDiagnostic";
import type {
  ArticleDraftPayload,
  DraftCandidate,
  ExtractedPreview,
  LinkType,
} from "./types";

export const DUPLICATE_LINK_MESSAGE =
  "이미 이 링크로 저장된 기사가 있습니다.";

export { INSUFFICIENT_MATERIAL_MESSAGE } from "./validateArticleQuality";

export type AnalyzeFromLinkOptions = {
  /** Allow saving when source ≥400 chars but generated body fails content/length hard gates. */
  allowShortSourceDraft?: boolean;
  /**
   * Admin collection-candidate 「기사 만들기」:
   * soft-fail length/thin density → review queue with warnings (RSS auto stays strict).
   */
  adminArticleCreate?: boolean;
};

export type AnalyzeFromLinkResult =
  | {
      ok: true;
      linkType: LinkType;
      linkTypeLabel: string;
      extracted: ExtractedPreview;
      transcript: TranscriptDiagnostic;
      /** Summarized draft (Korean body + originals); required for commit. */
      articleDraft: ArticleDraftPayload;
      candidates: DraftCandidate[];
      diagnostics: FromLinkAnalyzeDiagnostics;
    }
  | {
      ok: false;
      error: string;
      /** Present when extraction ran (YouTube transcript gate, summarize, etc.). */
      transcript?: TranscriptDiagnostic;
      extracted?: ExtractedPreview;
      linkType?: LinkType;
      linkTypeLabel?: string;
      diagnostics?: FromLinkAnalyzeDiagnostics;
    };

export type CommitFromLinkFailure = {
  ok: false;
  error: string;
  step?: string;
  code?: string;
  hint?: string;
  details?: string;
  duplicateArticleId?: string;
};

export type CommitFromLinkResult =
  | { ok: true; articleId: string }
  | CommitFromLinkFailure;

export type CommitFromLinkDraftsResult =
  | { ok: true; articleIds: string[] }
  | (CommitFromLinkFailure & {
      /** Successfully inserted before failure (partial save). */
      articleIds?: string[];
    });
