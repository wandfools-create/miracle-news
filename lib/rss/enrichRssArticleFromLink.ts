import "server-only";

import { applyFromLinkEnrichmentToArticle } from "@/lib/articles/applyFromLinkEnrichmentToArticle";
import { runRssFromLinkPipeline } from "@/lib/rss/runRssFromLinkPipeline";
import {
  categorizeEnrichFailure,
  type RssEnrichFailureCategory,
} from "@/lib/rss/enrichFailure";
import {
  getRssMaxEnrichPerRun,
  isRssAutoEnrichEnabled,
} from "@/lib/rss/rssCollectConfig";

export type EnrichRssArticleResult =
  | { ok: true; articleId: string; thumbnailSource: string }
  | {
      ok: false;
      articleId: string;
      error: string;
      step: string;
      category: RssEnrichFailureCategory;
      categoryLabel: string;
    };

export { getRssMaxEnrichPerRun, isRssAutoEnrichEnabled };

/** Re-enrich an existing review-queue row (admin / legacy). */
export async function enrichRssArticleFromLink(input: {
  articleId: string;
  originalUrl: string;
  sourceKey?: string;
}): Promise<EnrichRssArticleResult> {
  const { articleId, originalUrl, sourceKey } = input;

  console.info("[rss/enrich] start", { articleId, originalUrl, sourceKey });

  const pipeline = await runRssFromLinkPipeline({ originalUrl });

  if (!pipeline.ok) {
    console.warn("[rss/enrich] pipeline failed", {
      articleId,
      sourceKey,
      ...pipeline,
    });
    return {
      ok: false,
      articleId,
      error: pipeline.error,
      step: pipeline.step,
      category: pipeline.category,
      categoryLabel: pipeline.categoryLabel,
    };
  }

  const applied = await applyFromLinkEnrichmentToArticle({
    articleId,
    fields: pipeline.fields,
    autoGenerateAiThumbnail: false,
  });

  if (!applied.ok) {
    const { category, categoryLabel } = categorizeEnrichFailure(
      applied.step,
      applied.error
    );
    return {
      ok: false,
      articleId,
      error: applied.error,
      step: applied.step,
      category,
      categoryLabel,
    };
  }

  console.info("[rss/enrich] success", {
    articleId,
    sourceKey,
    thumbnailSource: applied.thumbnailSource,
  });

  return {
    ok: true,
    articleId,
    thumbnailSource: applied.thumbnailSource,
  };
}
