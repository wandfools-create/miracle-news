import ReviewRevisionForm from "@/components/admin/ReviewRevisionForm";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import { supabase } from "../../../../../lib/supabase";
import {
  approveArticle,
  clearMainTopStory,
  rejectArticle,
  setMainTopStory,
} from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

const categoryLabelMap: Record<string, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  religion: "종교",
  other: "기타",
};

const aiReviewLabelMap: Record<string, string> = {
  pending: "대기",
  pass: "통과",
  warning: "주의",
  fail: "실패",
};

function getCategoryLabel(value: string | null) {
  if (!value) return "미분류";
  return categoryLabelMap[value] ?? value;
}

function getAiReviewLabel(value: string | null) {
  if (!value) return "미정";
  return aiReviewLabelMap[value] ?? value;
}

function formatDate(value: string | null) {
  if (!value) return "날짜 미정";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 미정";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminReviewDetailPage({ params }: PageProps) {
  const { id } = await params;

  const baseSelect = `
      id,
      source,
      source_section,
      original_url,
      title_original,
      body_original,
      summary_original,
      title_ko,
      summary_ko,
      title_translated,
      body_translated,
      summary_translated,
      category,
      ai_review_status,
      ai_review_notes,
      review_status,
      revision_status,
      thumbnail_url,
      published_at
    `;

  let article: any | null = null;
  let error: { message?: string } | null = null;

  const withTopStory = await supabase
    .from("articles")
    .select(
      `
      ${baseSelect},
      is_top_story,
      top_story_order
    `
    )
    .eq("id", id)
    .single();

  if (!withTopStory.error && withTopStory.data) {
    article = withTopStory.data;
  } else {
    const fallback = await supabase
      .from("articles")
      .select(baseSelect)
      .eq("id", id)
      .single();
    article = fallback.data as (typeof article);
    error = fallback.error;
    if (article) {
      article.is_top_story = false;
      article.top_story_order = 0;
    }
  }

  if (error || !article) {
    return (
      <main className="min-h-screen bg-white text-black">
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="text-2xl font-bold sm:text-3xl">
            기사 정보를 불러올 수 없습니다.
          </h1>
          <p className="mt-4 text-sm text-gray-600 sm:text-base">
            해당 기사 상세 정보를 찾지 못했습니다.
          </p>
        </section>
      </main>
    );
  }

  const sourceLabel = getArticleSourceLabel({
    source: article.source,
    original_url: article.original_url,
  });

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 검토 대기 / 상세
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          기사 상세 검토
        </h1>

        <div className="mt-6 rounded-2xl border p-4 shadow-sm sm:mt-8 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:text-sm">
            <span>{sourceLabel}</span>
            <span>·</span>
            <span>{getCategoryLabel(article.category)}</span>
            <span>·</span>
            <span>AI 검토: {getAiReviewLabel(article.ai_review_status)}</span>
            <span>·</span>
            <span>검토 상태: {article.review_status || "미정"}</span>
            <span>·</span>
            <span>
              메인 톱:{" "}
              {article.is_top_story
                ? `지정됨 (우선순위 ${article.top_story_order ?? 0})`
                : "미지정"}
            </span>
          </div>

          <p className="mt-5 text-sm font-semibold text-gray-500">원문 링크</p>
          <a
            href={article.original_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block break-all text-sm leading-6 text-blue-600 underline"
          >
            {article.original_url}
          </a>

          <div className="mt-6">
            {article.thumbnail_url ? (
              <img
                src={article.thumbnail_url}
                alt={article.title_ko || article.title_translated || article.title_original}
                className="max-h-80 w-full rounded-2xl object-cover"
              />
            ) : (
              <div className="flex min-h-[8rem] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">
                이미지 없음
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 md:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6 md:col-span-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 sm:text-sm">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                  번역본
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                  출처: {sourceLabel}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                  AI 검토: {getAiReviewLabel(article.ai_review_status)}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                  검토 상태: {article.review_status || "미정"}
                </span>
              </div>

              <h2 className="mt-4 break-words text-xl font-semibold leading-8 sm:text-2xl">
                {article.title_ko || article.title_translated || article.title_original}
              </h2>

              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700 sm:text-base">
                {article.summary_ko || article.summary_translated || article.summary_original || "-"}
              </p>

              {article.body_translated ? (
                <div className="mt-6 border-t border-gray-100 pt-6">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    번역·요약 본문
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-800 sm:text-base">
                    {article.body_translated}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4 sm:p-5">
              <h3 className="text-base font-semibold sm:text-lg">원문 정보</h3>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Original Title
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {article.title_original || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Original Summary
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {article.summary_original || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Source Section
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {article.source_section || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Published At
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-gray-800 sm:text-base">
                    {formatDate(article.published_at)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-4 sm:p-5">
              <h3 className="text-base font-semibold sm:text-lg">원문 본문</h3>
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-gray-700 sm:mt-4">
                {article.body_original || "원문 본문이 없습니다."}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-amber-900">AI 검토 메모</h4>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  AI Review Status
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {getAiReviewLabel(article.ai_review_status)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  AI Review Notes
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-amber-900">
                  {article.ai_review_notes || "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border bg-green-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-green-800">기사 승인</h4>

            <form
              className="mt-4"
              action={async () => {
                "use server";
                await approveArticle(article.id);
              }}
            >
              <button
                type="submit"
                className="w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 sm:w-auto"
              >
                승인 완료로 이동
              </button>
            </form>
          </div>

          <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-indigo-900">
              메인 톱 기사 지정
            </h4>
            <p className="mt-2 text-sm text-indigo-900/90">
              수동 지정된 기사는 /ko, /en 메인 최상단 대표 기사 선정에서 자동 로직보다
              우선합니다. 여러 개 지정 시 우선순위 숫자가 작은 기사가 먼저 노출됩니다.
            </p>
            <p className="mt-2 text-sm text-indigo-800">
              현재 상태:{" "}
              {article.is_top_story
                ? `지정됨 (우선순위 ${article.top_story_order ?? 0})`
                : "미지정"}
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <form
                className="flex flex-wrap items-end gap-3"
                action={async (formData) => {
                  "use server";
                  const order = String(formData.get("topStoryOrder") || "");
                  await setMainTopStory(article.id, order);
                }}
              >
                <label className="text-sm text-indigo-900">
                  우선순위
                  <input
                    name="topStoryOrder"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={article.top_story_order ?? 0}
                    className="mt-1 w-24 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
                >
                  메인 톱 기사 지정
                </button>
              </form>

              {article.is_top_story ? (
                <form
                  action={async () => {
                    "use server";
                    await clearMainTopStory(article.id);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 hover:bg-indigo-100"
                  >
                    메인 톱 지정 해제
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          <ReviewRevisionForm articleId={article.id} />

          <div className="mt-6 rounded-2xl border bg-red-50 p-4 sm:mt-8 sm:p-5">
            <h4 className="text-base font-semibold text-red-800">기사 반려</h4>

            <form
              className="mt-4 space-y-4"
              action={async (formData) => {
                "use server";
                const rejectedReason = String(formData.get("rejectedReason") || "");
                await rejectArticle(article.id, rejectedReason);
              }}
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-red-800">
                  반려 사유
                </label>
                <textarea
                  name="rejectedReason"
                  rows={4}
                  className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl border border-red-300 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 sm:w-auto"
              >
                반려 저장
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}