import Link from "next/link";
import FromLinkWizard from "./FromLinkWizard";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ url?: string }>;
};

export default async function AdminFromLinkPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialUrl = typeof params.url === "string" ? params.url : "";

  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-sm font-semibold tracking-wide text-gray-500">
          관리자 · 링크에서 초안
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">링크에서 기사 초안</h1>
        <p className="mt-6 max-w-2xl text-lg text-gray-600">
          URL을 넣으면 유형을 판별하고, 본문을 <strong className="font-semibold text-gray-900">기사형으로 요약</strong>
          한 뒤 후보 제목을 고릅니다. 추출이 부족하면 <strong className="font-semibold text-gray-900">원문 보강 텍스트</strong>를
          붙여 넣어 함께 사용할 수 있습니다. 일반 HTTP로 본문이 안 잡히면{" "}
          <strong className="font-semibold text-gray-900">Playwright</strong>로 페이지를 렌더링해 다시 읽습니다
          (최초 1회 <code className="rounded bg-gray-100 px-1 text-sm">npx playwright install chromium</code>
          필요). YouTube는 <strong className="font-semibold text-gray-900">자막</strong>을 우선
          사용하며, 자막이 짧거나 없을 때는 보강 텍스트로 보완합니다. 요약할 수 없으면 후보를 만들지 않습니다. 선택한
          각 후보는{" "}
          <strong className="font-semibold text-gray-900">검토 대기</strong> 큐에만 들어가며 자동 공개되지 않습니다.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          <Link href="/admin/review" className="underline hover:text-gray-800">
            검토 대기 목록
          </Link>
          에서 이어서 편집·승인할 수 있습니다.
        </p>

        <div className="mt-12">
          <FromLinkWizard initialUrl={initialUrl} />
        </div>
      </section>
    </main>
  );
}
