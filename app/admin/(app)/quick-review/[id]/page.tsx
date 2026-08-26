export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  holdQuickReviewFromForm,
  quickPublishFromForm,
  sendQuickReviewToQueueFromForm,
} from "@/app/admin/(app)/quick-review/actions";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  ARTICLE_WORKFLOW,
  formatDateTimeKo,
  getCategoryLabel,
} from "@/lib/articleWorkflow";
import {
  isQuickReviewArticle,
  validateQuickPublishContent,
  type PublishArticleFields,
} from "@/lib/articles/quickPublishGuards";
import { previewPublishedSameEventForArticle } from "@/lib/same-event/previewPublishedSameEvent";
import { supabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    sameEvent?: string;
    matchId?: string;
    matchTitle?: string;
    matchSource?: string;
    matchPublishedAt?: string;
  }>;
};

function previewParagraphs(body: string | null, max = 3): string {
  if (!body?.trim()) return "";
  const parts = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.slice(0, max).join("\n\n");
}

export default async function AdminQuickReviewDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const search = await searchParams;
  const { error: errorParam } = search;

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
      body_translated,
      body_original,
      category,
      status,
      review_status,
      is_published,
      thumbnail_url,
      collected_at,
      published_at,
      ai_review_status,
      ai_review_notes
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !article) {
    notFound();
  }

  if (!isQuickReviewArticle(article)) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-black">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-gray-500">관리자 / 빠른 검토</p>
          <h1 className="mt-4 text-2xl font-bold">빠른 검토 대상이 아닙니다</h1>
          <p className="mt-3 text-gray-600">
            현재 상태: {article.review_status} / {article.status}
            {article.is_published ? " (공개됨)" : ""}
          </p>
          <Link
            href="/admin/quick-review"
            className="mt-6 inline-flex text-sm font-medium underline"
          >
            목록으로
          </Link>
        </div>
      </main>
    );
  }

  const fields = article as PublishArticleFields;
  const contentCheck = validateQuickPublishContent(fields);
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
  const sameEventBlock =
    sameEventFromRedirect ||
    (sameEventPreview.blocked && sameEventPreview.match
      ? {
          id: sameEventPreview.match.id,
          title: sameEventPreview.match.title,
          source: sameEventPreview.match.source,
          publishedAt: sameEventPreview.match.publishedAt,
        }
      : null);
  const softWarning = sameEventPreview.softWarning;
  const titleKo =
    article.title_ko ||
    article.title_translated ||
    article.title_original ||
    "제목 없음";
  const titleEn = article.title_original;
  const summary =
    article.summary_ko ||
    article.summary_translated ||
    article.summary_original ||
    "";
  const bodyPreview = previewParagraphs(
    article.body_translated || article.body_original,
    3
  );
  const notes = article.ai_review_notes?.trim() || "";
  const manualSource =
    notes.includes("관리자 수동 원문 사용") ||
    notes.includes("manual_source_body_used=true");
  const forceCreate =
    notes.includes("관리자 강제 기사화") ||
    notes.includes("admin_force_create=true");

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          관리자 / 빠른 검토
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">빠른 검토</h1>
        <p className="mt-2 text-sm text-gray-500">
          {getArticleSourceLabel({ source: article.source })} ·{" "}
          {getCategoryLabel(article.category)} ·{" "}
          {formatDateTimeKo(article.collected_at)}
        </p>
        {(manualSource || forceCreate) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {manualSource ? (
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
                수동 원문 사용
              </span>
            ) : null}
            {forceCreate ? (
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-900">
                강제 기사화
              </span>
            ) : null}
          </div>
        ) : null}

        {errorParam ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {decodeURIComponent(errorParam)}
          </p>
        ) : null}

        {sameEventBlock ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">유사한 공개 기사가 있습니다</p>
            <p className="mt-2">{sameEventBlock.title}</p>
            <p className="mt-1 text-amber-900/80">
              {getArticleSourceLabel({ source: sameEventBlock.source })}
              {sameEventBlock.publishedAt
                ? ` · ${formatDateTimeKo(sameEventBlock.publishedAt)}`
                : ""}
            </p>
            <Link
              href={`/admin/review/${sameEventBlock.id}`}
              className="mt-3 inline-flex text-sm font-medium underline"
            >
              기존 기사 확인
            </Link>
          </div>
        ) : null}

        {!sameEventBlock && softWarning ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            <p className="font-medium">참고: 관련 공개 기사가 있을 수 있습니다</p>
            <p className="mt-1">{softWarning.title}</p>
            <p className="mt-1 text-xs text-gray-500">
              {getArticleSourceLabel({ source: softWarning.source })}
            </p>
            <Link
              href={`/admin/review/${softWarning.id}`}
              className="mt-2 inline-flex text-sm underline"
            >
              기사 열기
            </Link>
          </div>
        ) : null}

        {!contentCheck.ok ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            바로 공개 불가: {contentCheck.errors.join(" ")}
          </p>
        ) : null}

        {contentCheck.warnings.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">품질 경고 (관리자 판단으로 진행 가능)</p>
            <ul className="mt-2 list-disc pl-5">
              {contentCheck.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-2xl bg-gray-100">
          {article.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.thumbnail_url}
              alt=""
              className="max-h-80 w-full object-cover"
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              대표 이미지 없음
            </div>
          )}
        </div>

        <h2 className="mt-8 text-2xl font-semibold">{titleKo}</h2>
        {titleEn && titleEn !== titleKo ? (
          <p className="mt-2 text-lg text-gray-600">{titleEn}</p>
        ) : null}

        <h3 className="mt-8 text-sm font-semibold text-gray-500">요약</h3>
        <p className="mt-2 whitespace-pre-wrap text-gray-800">
          {summary || "(요약 없음)"}
        </p>

        <h3 className="mt-8 text-sm font-semibold text-gray-500">
          본문 미리보기 (2~3문단)
        </h3>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-gray-800">
          {bodyPreview || "(본문 없음)"}
        </pre>

        {article.original_url ? (
          <>
            <h3 className="mt-8 text-sm font-semibold text-gray-500">원문</h3>
            <a
              href={article.original_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block break-all text-sm text-blue-700 underline"
            >
              {article.original_url}
            </a>
          </>
        ) : null}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {!sameEventBlock ? (
            <form action={quickPublishFromForm}>
              <input type="hidden" name="articleId" value={article.id} />
              <button
                type="submit"
                disabled={!contentCheck.ok}
                className="w-full rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
              >
                ✅ 확인 후 바로 공개
              </button>
            </form>
          ) : (
            <form action={quickPublishFromForm}>
              <input type="hidden" name="articleId" value={article.id} />
              <input type="hidden" name="allowSameEventOverride" value="1" />
              <button
                type="submit"
                disabled={!contentCheck.ok}
                className="w-full rounded-xl border border-amber-600 bg-amber-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
              >
                그래도 공개 (관리자 override)
              </button>
            </form>
          )}

          <form action={sendQuickReviewToQueueFromForm}>
            <input type="hidden" name="articleId" value={article.id} />
            <button
              type="submit"
              className="w-full rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 sm:w-auto"
            >
              ✏️ 수정 필요 → 검토 대기
            </button>
          </form>

          <form action={holdQuickReviewFromForm}>
            <input type="hidden" name="articleId" value={article.id} />
            <button
              type="submit"
              className="w-full rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 sm:w-auto"
            >
              ❌ 취소/보류
            </button>
          </form>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          이 단계에서는 OpenAI를 호출하지 않습니다. 상태:{" "}
          {ARTICLE_WORKFLOW.quickReview.review_status}
        </p>

        <Link
          href="/admin/quick-review"
          className="mt-8 inline-flex text-sm font-medium underline"
        >
          목록으로
        </Link>
      </section>
    </main>
  );
}
