export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import ShortsPackageEditor from "./ShortsPackageEditor";
import { resolveShortsPackageRepository } from "@/lib/shorts/repository/resolveShortsPackageRepository";

export default async function ShortsPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repoResult = resolveShortsPackageRepository();

  if (!repoResult.ok) {
    return (
      <main className="min-h-screen bg-white text-black">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {repoResult.error}
          </div>
          <Link href="/admin/shorts" className="mt-4 inline-block underline">
            Shorts 제작실로 돌아가기
          </Link>
        </section>
      </main>
    );
  }

  const loaded = await repoResult.data.getById(id);
  if (!loaded.ok) {
    return (
      <main className="min-h-screen bg-white text-black">
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loaded.error}
          </div>
        </section>
      </main>
    );
  }

  if (!loaded.data) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          관리자 / Miracle News Shorts AI
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">제작 패키지 편집</h1>
        <p className="mt-4 text-gray-600">
          생성 결과를 수정·저장할 수 있습니다.{" "}
          <Link href="/admin/shorts" className="underline">
            Shorts 제작실
          </Link>
          로 돌아가 기사를 다시 선택할 수 있습니다.
        </p>
        <ShortsPackageEditor record={loaded.data} />
      </section>
    </main>
  );
}
