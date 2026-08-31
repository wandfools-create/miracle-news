import { redirect } from "next/navigation";
import { fetchFirstMobileReviewArticleId } from "@/lib/admin/fetchMobileReviewNeighbors";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ error?: string; published?: string }>;
};

export default async function MobileReviewIndexPage({ searchParams }: PageProps) {
  const search = await searchParams;
  const firstId = await fetchFirstMobileReviewArticleId();

  if (!firstId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 text-center">
        <div>
          <h1 className="text-xl font-bold">검토 대기 기사 없음</h1>
          <p className="mt-2 text-sm text-neutral-600">
            {search.published === "1"
              ? "마지막 기사를 공개했습니다."
              : "현재 검토할 기사가 없습니다."}
          </p>
          <a href="/admin/review" className="mt-4 inline-block text-sm underline">
            검토 대기 목록
          </a>
        </div>
      </main>
    );
  }

  const q = new URLSearchParams();
  if (search.error) q.set("error", search.error);
  if (search.published) q.set("published", search.published);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  redirect(`/admin/review/mobile/${firstId}${suffix}`);
}
