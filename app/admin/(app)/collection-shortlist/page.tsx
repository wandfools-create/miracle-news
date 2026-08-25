import Link from "next/link";

import CollectionShortlistWorkbench, {
  type ShortlistCard,
} from "@/components/admin/CollectionShortlistWorkbench";
import { classifyCandidateCategory } from "@/lib/collection-candidates/candidateCategory";
import { normalizeAiRecommendGrade } from "@/lib/collection-candidates/candidateRecommend";
import { fetchCollectionCandidates } from "@/lib/admin/fetchCollectionCandidates";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PageProps = {
  searchParams: Promise<{
    made?: string;
    bulkMade?: string;
    restored?: string;
    dismissed?: string;
    error?: string;
  }>;
};

export default async function CollectionShortlistPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const made = params.made?.trim() || null;
  const bulkMade = params.bulkMade?.trim() || null;
  const restored = params.restored?.trim() || null;
  const dismissed = params.dismissed?.trim() || null;
  const error = params.error?.trim() || null;

  const { candidates, error: fetchError } = await fetchCollectionCandidates({
    status: "shortlisted",
    view: "ai",
    limit: 200,
  });

  const cards: ShortlistCard[] = candidates.map((c) => ({
    id: c.id,
    source: c.source,
    feedLabel: c.feed_label,
    rssTitle: c.rss_title,
    rssSummary: c.rss_summary,
    originalUrl: c.original_url,
    rssPublishedAt: c.rss_published_at,
    candidateCategory: classifyCandidateCategory({
      source: c.source,
      rssTitle: c.rss_title,
      rssSummary: c.rss_summary,
      category: c.category,
    }),
    aiRecommendGrade: normalizeAiRecommendGrade(c.ai_recommend_grade),
    aiRecommendScore:
      typeof c.ai_recommend_score === "number" ? c.ai_recommend_score : null,
    aiRecommendReason: c.ai_recommend_reason,
  }));

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-xs font-semibold tracking-wide text-gray-500">
          관리자 / 편집 보관함
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          편집 보관함
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          후보에서 선정한 기사만 모읍니다. 여기서 다시 검토한 뒤 기사 만들기를
          실행하세요. 보관함 이동·되돌리기·제외에는 OpenAI 비용이 없습니다.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          <Link href="/admin/collection-candidates" className="underline">
            ← 수집 후보로
          </Link>
        </p>

        {made || bulkMade ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            {bulkMade ? `기사 만들기 ${bulkMade}건 완료. ` : null}
            {made ? (
              <>
                검토 대기:{" "}
                <Link href={`/admin/review/${made}`} className="font-semibold underline">
                  열기
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        {restored ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
            {restored}건을 후보 목록(pending)으로 되돌렸습니다.
          </div>
        ) : null}

        {dismissed ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
            {dismissed}건을 제외했습니다.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            처리에 실패했습니다.
          </div>
        ) : null}

        {fetchError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {fetchError.message}
          </div>
        ) : null}

        {!fetchError && cards.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
            보관함이 비어 있습니다.{" "}
            <Link href="/admin/collection-candidates" className="underline">
              후보 워크벤치
            </Link>
            에서 「편집 보관함에 담기」로 추가하세요.
          </div>
        ) : null}

        {!fetchError && cards.length > 0 ? (
          <div className="mt-5">
            <CollectionShortlistWorkbench candidates={cards} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
