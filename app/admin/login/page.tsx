import { Suspense } from "react";
import AdminLoginForm from "@/components/admin/AdminLoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          Miracle News Admin
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">관리자 로그인</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          승인된 관리자 계정으로 로그인하세요. 로그인 후 기사 검토·발행 기능을
          사용할 수 있습니다.
        </p>

        <Suspense fallback={<p className="mt-8 text-sm text-gray-500">로딩 중…</p>}>
          <AdminLoginForm />
        </Suspense>
      </section>
    </main>
  );
}
