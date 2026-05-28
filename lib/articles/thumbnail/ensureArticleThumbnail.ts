import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeThumbnailUrl } from "@/lib/from-link/sanitizeThumbnail";
import { generateAiThumbnailImage } from "./generateAiThumbnailImage";
import { uploadArticleThumbnail } from "./uploadArticleThumbnail";

export type EnsureArticleThumbnailInput = {
  articleId: string;
  existingThumbnailUrl: string | null | undefined;
  category: string | null | undefined;
  titleKo: string;
  summaryKo?: string | null;
  supabaseProjectUrl: string;
};

export type EnsureArticleThumbnailResult =
  | { ok: true; thumbnailUrl: string; source: "existing" | "ai_generated" }
  | { ok: true; thumbnailUrl: null; source: "none" }
  | { ok: false; error: string };

/**
 * Use original thumbnail when present; otherwise generate AI editorial illustration.
 */
export async function ensureArticleThumbnail(
  supabase: SupabaseClient,
  input: EnsureArticleThumbnailInput
): Promise<EnsureArticleThumbnailResult> {
  const existing = sanitizeThumbnailUrl(input.existingThumbnailUrl);
  if (existing) {
    return { ok: true, thumbnailUrl: existing, source: "existing" };
  }

  const titleKo = input.titleKo.trim();
  if (!titleKo) {
    return { ok: true, thumbnailUrl: null, source: "none" };
  }

  const generated = await generateAiThumbnailImage({
    category: input.category,
    titleKo,
    summaryKo: input.summaryKo,
  });

  if (!generated.ok) {
    console.warn("[ensureArticleThumbnail] generation skipped", {
      articleId: input.articleId,
      error: generated.error,
    });
    return { ok: true, thumbnailUrl: null, source: "none" };
  }

  const uploaded = await uploadArticleThumbnail(supabase, {
    articleId: input.articleId,
    buffer: generated.buffer,
    supabaseProjectUrl: input.supabaseProjectUrl,
  });

  if (!uploaded.ok) {
    console.warn("[ensureArticleThumbnail] upload failed", {
      articleId: input.articleId,
      error: uploaded.error,
    });
    return { ok: true, thumbnailUrl: null, source: "none" };
  }

  console.info("[ensureArticleThumbnail] ai thumbnail saved", {
    articleId: input.articleId,
    storagePath: uploaded.storagePath,
  });

  return {
    ok: true,
    thumbnailUrl: uploaded.publicUrl,
    source: "ai_generated",
  };
}

export const AI_THUMBNAIL_REVIEW_NOTE =
  "[AI 썸네일] 원본 이미지 없음 → OpenAI 일러스트(뉴스 스타일) 자동 생성";
