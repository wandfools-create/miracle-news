export const dynamic = "force-dynamic";

import ShortsStudioWorkspace, {
  type ShortsPublishedArticle,
} from "./ShortsStudioWorkspace";
import { supabase } from "@/lib/supabase";
import { resolveShortsPackageRepository } from "@/lib/shorts/repository/resolveShortsPackageRepository";
import type { ShortsProductionPackageRecord } from "@/lib/shorts/shortsPackageTypes";

export default async function AdminShortsPage() {
  const repoResult = resolveShortsPackageRepository();
  let recentPackages: ShortsProductionPackageRecord[] = [];
  let storeError: string | null = null;

  if (!repoResult.ok) {
    storeError = repoResult.error;
  } else {
    const listed = await repoResult.data.listRecent(8);
    if (!listed.ok) {
      storeError = listed.error;
    } else {
      recentPackages = listed.data;
    }
  }

  const { data, error } = await supabase
    .from("articles")
    .select(
      "id, source, source_country, title_ko, title_original, summary_ko, summary_original, thumbnail_url, published_at"
    )
    .eq("status", "published")
    .eq("review_status", "approved")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(120);

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          관리자 / Miracle News Shorts AI
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Shorts 제작실</h1>
        <p className="mt-4 max-w-3xl text-gray-600">
          실제 공개된 기사 3~5개를 선택해 한눈 아침뉴스·저녁뉴스 AI 제작 패키지를 생성합니다.
          자동 공개는 없으며 사람 검토가 필요합니다.
        </p>

        {storeError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {storeError}
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            공개 기사를 불러오지 못했습니다: {error.message}
          </div>
        ) : (
          <ShortsStudioWorkspace
            articles={(data ?? []) as ShortsPublishedArticle[]}
            recentPackages={recentPackages}
            storeBlocked={Boolean(storeError)}
            storeError={storeError}
          />
        )}
      </section>
    </main>
  );
}
