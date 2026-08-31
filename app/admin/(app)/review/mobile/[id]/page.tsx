export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import MobileReviewDetail from "@/components/admin/MobileReviewDetail";
import {
  buildReviewArticleDisplay,
  getReviewKoBody,
  type ReviewQueueArticleRow,
} from "@/lib/admin/reviewArticleDisplay";
import { fetchMobileReviewNeighbors } from "@/lib/admin/fetchMobileReviewNeighbors";
import {
  isPendingReviewArticle,
  validateQuickPublishContent,
} from "@/lib/articles/quickPublishGuards";
import { previewPublishedSameEventForArticle } from "@/lib/same-event/previewPublishedSameEvent";
import { supabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    published?: string;
    sameEvent?: string;
    matchId?: string;
    matchTitle?: string;
    matchSource?: string;
    matchPublishedAt?: string;
  }>;
};

export default async function MobileReviewArticlePage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const search = await searchParams;

  const { data: article, error } = await supabase
    .from("articles")
    .select(
      `
      id,
      source,
      original_url,
      title_original,
      title_translated,
      title_ko,
      summary_original,
      summary_translated,
      summary_ko,
      body_original,
      body_translated,
      category,
      thumbnail_url,
      collected_at,
      published_at,
      status,
      review_status,
      status,
      is_published,
      ai_review_status,
      ai_review_notes
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !article) {
    notFound();
  }

  if (!isPendingReviewArticle(article)) {
    return (
      <main className="min-h-screen bg-white px-6 py-10">
        <h1 className="text-xl font-bold">검토 대기 대상이 아닙니다</h1>
        <p className="mt-2 text-sm text-neutral-600">
          현재: {article.review_status} / {article.status}
        </p>
        <a href="/admin/review/mobile" className="mt-4 inline-block text-sm underline">
          모바일 검토 홈
        </a>
      </main>
    );
  }

  const row = article as ReviewQueueArticleRow;
  const display = buildReviewArticleDisplay(row);
  const contentCheck = validateQuickPublishContent(article);
  const sameEventPreview = await previewPublishedSameEventForArticle(id);
  const sameEventFromRedirect =
    search.sameEvent === "1" && search.matchId
      ? {
          id: search.matchId,
          title: search.matchTitle || "(제목 없음)",
          source: search.matchSource || "?",
          publishedAt: search.matchPublishedAt || null,
        }
      : null;
  const sameEventMatch =
    sameEventFromRedirect ??
    (sameEventPreview.blocked ? sameEventPreview.match : null);
  const neighbors = await fetchMobileReviewNeighbors(id);

  return (
    <MobileReviewDetail
      article={article}
      neighbors={neighbors}
      displayTitle={display.displayTitle}
      displaySummary={display.displaySummary}
      displayBody={getReviewKoBody(row)}
      contentOk={contentCheck.ok}
      contentErrors={contentCheck.errors}
      sameEventBlocked={Boolean(sameEventMatch)}
      sameEventMatch={sameEventMatch}
      errorMessage={search.error ?? null}
      publishedBanner={search.published ? search.published : null}
    />
  );
}
