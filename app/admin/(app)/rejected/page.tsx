import Link from "next/link";
import AdminListPager from "@/components/admin/AdminListPager";
import { getArticleSourceLabel } from "@/lib/article/sourceResolution";
import {
  ADMIN_LIST_PAGE_SIZE,
  adminListRange,
  parseAdminListPage,
} from "@/lib/admin/listPagination";
import { supabase } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

function formatDateTimeKo(value: string | null | undefined) {
  if (!value) return "기록 없음";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminRejectedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseAdminListPage(params.page);
  const { from, to } = adminListRange(page);

  const { data: articles, error, count } = await supabase
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
      thumbnail_url,
      rejected_reason,
      status,
      review_status,
      updated_at
    `,
      { count: "exact" }
    )
    .eq("status", "rejected")
    .eq("review_status", "rejected")
    .order("updated_at", { ascending: false })
    .range(from, to);

  const rows = articles ?? [];
  const totalCount = count ?? 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-xs font-semibold tracking-wide text-gray-500 sm:text-sm">
          관리자 / 반려 기사
        </p>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:mt-4 sm:text-3xl">
          반려 기사
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base">
          검토 후 반려된 기사 목록입니다.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mt-8">
            데이터를 불러오는 중 오류가 발생했습니다: {error.message}
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="mt-6 rounded-2xl border p-5 text-sm text-gray-600 sm:mt-8 sm:p-6 sm:text-base">
            현재 반려된 기사가 없습니다.
          </div>
        ) : null}

        {!error && rows.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4">
            {rows.map((article) => (
              <article
                key={article.id}
                className="rounded-2xl border p-4 shadow-sm sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:gap-5 md:flex-row md:items-start">
                  <div className="h-24 w-full rounded-xl bg-gray-100 sm:h-28 md:w-44">
                    {article.thumbnail_url ? (
                      <img
                        src={article.thumbnail_url}
                        alt={
                          article.title_ko ||
                          article.title_translated ||
                          article.title_original
                        }
                        className="h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-400">
                        이미지 없음
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 sm:text-xs">
                      <span>
                        {getArticleSourceLabel({
                          source: article.source,
                          original_url: article.original_url,
                        })}
                      </span>
                      <span>·</span>
                      <span>반려됨</span>
                    </div>

                    <h2 className="mt-3 break-words text-lg font-semibold leading-7 sm:text-xl">
                      {article.title_ko ||
                        article.title_translated ||
                        article.title_original}
                    </h2>

                    <p className="mt-2 break-words text-sm leading-6 text-gray-600">
                      {article.summary_ko ||
                        article.summary_translated ||
                        article.summary_original ||
                        "요약이 없습니다."}
                    </p>

                    <p className="mt-2 break-words text-sm leading-6 text-gray-500">
                      원문 제목: {article.title_original}
                    </p>

                    <p className="mt-3 break-words text-sm leading-6 text-gray-600">
                      반려 사유: {article.rejected_reason || "사유 없음"}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:mt-4 sm:text-sm">
                      <span>status: {article.status || "없음"}</span>
                      <span>·</span>
                      <span>review: {article.review_status || "없음"}</span>
                      <span>·</span>
                      <span>수정 시각: {formatDateTimeKo(article.updated_at)}</span>
                    </div>

                    <div className="mt-4 sm:mt-5">
                      <Link
                        href={`/admin/review/${article.id}`}
                        className="text-sm font-medium text-blue-600 underline"
                      >
                        기사 상세 다시 보기
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}