import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          403 Forbidden
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          관리자 접근 권한이 없습니다
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          현재 로그인한 계정은 관리자 허용 목록에 없습니다. 권한 요청이 필요하면
          운영자에게 문의해 주세요.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/admin/login"
            className="rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900"
          >
            로그인 페이지로 이동
          </Link>
          <Link
            href="/ko"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-100"
          >
            홈으로 이동
          </Link>
        </div>
      </section>
    </main>
  );
}
