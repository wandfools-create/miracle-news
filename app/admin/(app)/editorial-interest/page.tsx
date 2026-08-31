import { fetchEditorialInterestRules } from "@/lib/editorialInterest/fetchInterestRules";
import { saveEditorialInterestRuleFromForm } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function EditorialInterestPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rules = await fetchEditorialInterestRules();

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold text-gray-500">관리자 / 편집 기준</p>
        <h1 className="mt-2 text-2xl font-bold">관심 기사 기준</h1>
        <p className="mt-2 text-sm text-gray-600">
          키워드·주제·국가 기준으로 수집 후보를 표시하고 AI 추천 프롬프트에 반영합니다.
          관심 일치만으로 자동 기사화·공개는 하지 않습니다.
        </p>

        {params.saved ? (
          <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            저장되었습니다.
          </p>
        ) : null}
        {params.error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {params.error}
          </p>
        ) : null}

        <ul className="mt-6 space-y-4">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <form action={saveEditorialInterestRuleFromForm} className="space-y-3">
                <input type="hidden" name="id" value={rule.id} />
                <label className="block text-sm">
                  이름
                  <input
                    name="name"
                    defaultValue={rule.name}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  관심 키워드 (쉼표 구분)
                  <input
                    name="keywords"
                    defaultValue={rule.keywords.join(", ")}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  내용 설명
                  <textarea
                    name="contentDescription"
                    defaultValue={rule.contentDescription ?? ""}
                    rows={2}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    국가
                    <input
                      name="countries"
                      defaultValue={rule.countries.join(", ")}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    주제
                    <input
                      name="topics"
                      defaultValue={rule.topics.join(", ")}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    인물
                    <input
                      name="people"
                      defaultValue={rule.people.join(", ")}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    기관
                    <input
                      name="organizations"
                      defaultValue={rule.organizations.join(", ")}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  제외 주제
                  <input
                    name="excludeTopics"
                    defaultValue={rule.excludeTopics.join(", ")}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="text-sm">
                    우선순위
                    <input
                      name="priority"
                      type="number"
                      defaultValue={rule.priority}
                      className="ml-2 w-20 rounded-lg border px-2 py-1"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={rule.isActive}
                    />
                    활성
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                  >
                    저장
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>

        <form action={saveEditorialInterestRuleFromForm} className="mt-8">
          <input type="hidden" name="name" value="새 관심 기준" />
          <button
            type="submit"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold"
          >
            + 새 기준 추가
          </button>
        </form>
      </div>
    </main>
  );
}
