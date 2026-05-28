import Link from "next/link";

export default function AdminHomePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          관리자 대시보드
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">
          미라클 뉴스 관리자
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          이곳은 기사 검토, 수정 요청, 승인, 발행을 관리하는 내부 관리자 화면입니다.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Link
            href="/admin/from-link"
            className="rounded-2xl border p-6 shadow-sm hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">링크에서 초안</h2>
            <p className="mt-2 text-sm text-gray-600">
              URL로 미리보기·후보 생성 후 검토 대기에만 저장
            </p>
          </Link>

          <Link
            href="/admin/review"
            className="rounded-2xl border p-6 shadow-sm hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">검토 대기</h2>
            <p className="mt-2 text-sm text-gray-600">
              사람 검토가 필요한 기사 목록 보기
            </p>
          </Link>

          <Link
            href="/admin/on-hold"
            className="rounded-2xl border p-6 shadow-sm hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">보류 기사</h2>
            <p className="mt-2 text-sm text-gray-600">
              검토를 보류해 둔 기사 목록 보기
            </p>
          </Link>

          <Link
            href="/admin/revision"
            className="rounded-2xl border p-6 shadow-sm hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">수정 대기</h2>
            <p className="mt-2 text-sm text-gray-600">
              수정 요청 및 재검토 기사 보기
            </p>
          </Link>

          <Link
            href="/admin/approved"
            className="rounded-2xl border p-6 shadow-sm hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">승인 완료</h2>
            <p className="mt-2 text-sm text-gray-600">
              승인되었지만 아직 공개 전인 기사 보기
            </p>
          </Link>

          <Link
            href="/admin/published"
            className="rounded-2xl border p-6 shadow-sm hover:bg-gray-50"
          >
            <h2 className="text-xl font-semibold">공개 기사</h2>
            <p className="mt-2 text-sm text-gray-600">
              현재 사이트에 공개된 기사 보기
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}