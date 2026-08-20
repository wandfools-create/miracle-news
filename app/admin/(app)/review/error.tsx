"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/review] route error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold text-red-800">검토 대기 페이지 오류</h1>
        <p className="mt-4 text-sm leading-6 text-gray-700">
          목록을 렌더링하는 중 오류가 발생했습니다. 서버 로그에{" "}
          <code className="rounded bg-gray-100 px-1">[admin/review]</code> 로 시작하는
          메시지와 문제 기사 ID가 기록됩니다.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-red-100 bg-red-50 p-4 text-xs text-red-900">
          {error.message}
        </pre>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            다시 시도
          </button>
          <Link
            href="/admin"
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
          >
            관리자 홈
          </Link>
        </div>
      </section>
    </main>
  );
}
