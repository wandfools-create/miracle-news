import {
  fetchEditorialCollectionRules,
  fetchRecentEditorialAudit,
} from "@/lib/editorial-rules/editorialRuleStore";
import { deleteCollectionRuleAction, saveCollectionRuleAction } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> };

type AuditRow = {
  id: string;
  source: string;
  original_url: string;
  title_excerpt: string;
  reason: string;
  created_at: string;
};

const actionLabels = {
  prioritize: "우선 검토",
  review: "사람 검토로 보냄",
  exclude: "자동 제외",
} as const;

function RuleForm({ rule }: { rule?: Awaited<ReturnType<typeof fetchEditorialCollectionRules>>["rules"][number] }) {
  return (
    <form action={saveCollectionRuleAction} className="space-y-3 rounded-xl border border-gray-200 p-4">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">기준 이름
          <input name="name" required defaultValue={rule?.name ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">처리
          <select name="action" defaultValue={rule?.action ?? "review"} className="mt-1 w-full rounded-lg border px-3 py-2">
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">단어·구문 (쉼표 또는 줄바꿈)
        <textarea name="keywords" required rows={2} defaultValue={rule?.keywords.join(", ") ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <label className="block text-sm">판단 기준 설명
        <textarea name="contentDescription" rows={2} defaultValue={rule?.contentDescription ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">언론사 key (비우면 전체)
          <input name="sourceKey" defaultValue={rule?.sourceKey ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">우선순위 0–100
          <input name="priority" type="number" min="0" max="100" defaultValue={rule?.priority ?? 50} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input name="isActive" type="checkbox" defaultChecked={rule?.isActive ?? true} /> 활성
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="cursor-pointer rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">저장</button>
        {rule ? (
          <button formAction={deleteCollectionRuleAction} name="id" value={rule.id} className="cursor-pointer rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50">삭제</button>
        ) : null}
      </div>
    </form>
  );
}

export default async function CollectionRulesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [{ rules, schemaReady, error }, audit] = await Promise.all([
    fetchEditorialCollectionRules(),
    fetchRecentEditorialAudit(),
  ]);
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold text-gray-500">관리자 / 수집 기준</p>
        <h1 className="mt-2 text-2xl font-bold">관심 기사·제외 기준</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          규칙 통과는 수집·검토 대상으로 남긴다는 뜻이며 공개가 아닙니다. 기사 공개는 관리자 검토 후에만 가능합니다.
          제외 규칙과 사상자·정부 정책·국제 안보 신호가 함께 나타나면 자동 제외하지 않고 사람 검토로 보냅니다.
        </p>
        {!schemaReady ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Migration 적용 전입니다. 현재 수집은 기존 방식으로 계속되며 어떤 기사도 규칙으로 자동 제외되지 않습니다.</div> : null}
        {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">기준 조회 오류: {error}</div> : null}
        {params.saved || params.deleted ? <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">변경사항을 저장했습니다.</div> : null}
        {params.error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">저장하지 못했습니다. Migration 적용 여부와 관리자 권한을 확인해 주세요.</div> : null}

        <section className="mt-8">
          <h2 className="text-lg font-bold">새 기준</h2>
          <div className="mt-3"><RuleForm /></div>
        </section>
        <section className="mt-8">
          <h2 className="text-lg font-bold">저장된 기준 {rules.length}개</h2>
          <div className="mt-3 space-y-4">{rules.map((rule) => <RuleForm key={rule.id} rule={rule} />)}</div>
        </section>
        <section className="mt-10">
          <h2 className="text-lg font-bold">최근 자동 제외 기록</h2>
          <p className="mt-1 text-sm text-gray-600">관리자 전용이며 본문·RSS 요약은 저장하지 않습니다. 출처 비활성화는 자동으로 수행하지 않습니다.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b"><th className="p-2">시각</th><th className="p-2">언론사</th><th className="p-2">제목</th><th className="p-2">이유</th><th className="p-2">원문</th></tr></thead>
              <tbody>{(audit.rows as AuditRow[]).map((row) => <tr key={row.id} className="border-b align-top"><td className="p-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "America/New_York" })}</td><td className="p-2">{row.source}</td><td className="p-2">{row.title_excerpt}</td><td className="p-2">{row.reason}</td><td className="p-2"><a href={row.original_url} target="_blank" rel="noreferrer" className="underline">열기</a></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
