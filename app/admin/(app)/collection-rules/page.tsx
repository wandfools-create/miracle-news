import Link from "next/link";

import {
  deactivateCollectionRuleAction,
  saveCollectionRuleAction,
  toggleCollectionRuleActiveAction,
} from "@/app/admin/(app)/collection-rules/actions";
import {
  fetchEditorialCollectionRules,
  fetchRecentEditorialAudit,
} from "@/lib/editorial-rules/editorialRuleStore";
import { fetchCandidatesForEditorialPreview } from "@/lib/editorial-rules/fetchPreviewCandidates";
import { previewEditorialRulesOnCandidates } from "@/lib/editorial-rules/previewEditorialRules";
import {
  EDITORIAL_ACTION_LABELS,
  EDITORIAL_KIND_LABELS,
  EDITORIAL_REGION_LABELS,
  type EditorialCollectionRule,
} from "@/lib/editorial-rules/types";
import { RSS_FEED_SOURCES } from "@/lib/rss/feedSources";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    saved?: string;
    deactivated?: string;
    error?: string;
  }>;
};

const SOURCE_OPTIONS = Array.from(
  new Set(RSS_FEED_SOURCES.map((f) => f.sourceKey))
).sort();

function RuleForm({
  rule,
}: {
  rule?: EditorialCollectionRule;
}) {
  const isNew = !rule;
  return (
    <form
      action={saveCollectionRuleAction}
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4"
    >
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          규칙 이름
          <input
            name="name"
            required
            defaultValue={rule?.name ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          규칙 유형
          <select
            name="kind"
            defaultValue={rule?.kind ?? "keyword"}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {Object.entries(EDITORIAL_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          동작
          <select
            name="action"
            defaultValue={rule?.action ?? "review"}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {Object.entries(EDITORIAL_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          지역
          <select
            name="region"
            defaultValue={rule?.region ?? "all"}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {Object.entries(EDITORIAL_REGION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        키워드 (쉼표 또는 줄바꿈 · 정규식 금지)
        <textarea
          name="keywords"
          rows={3}
          defaultValue={rule?.keywords.join(", ") ?? ""}
          className="mt-1 w-full rounded-lg border px-3 py-2"
          placeholder="예: COVID, 집단감염, public health emergency"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          카테고리 (유형=카테고리일 때)
          <input
            name="category"
            defaultValue={rule?.category ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          출처 (전체면 비움 / 유형=출처면 필수)
          <select
            name="sourceKey"
            defaultValue={rule?.sourceKey ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="">전체</option>
            {SOURCE_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          우선순위 0–100
          <input
            name="priority"
            type="number"
            min={0}
            max={100}
            defaultValue={rule?.priority ?? 50}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          관리자 메모
          <input
            name="adminNote"
            defaultValue={rule?.adminNote ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmSourceWideExclude"
          value="1"
          className="mt-1"
        />
        <span>
          출처 전체 자동 제외를 확인합니다 (키워드 없이 출처만으로 제외할 때
          필수).
        </span>
      </label>
      {!isNew ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            value="1"
            defaultChecked={rule?.isActive}
          />
          활성화 (저장 전 미리보기로 확인하세요)
        </label>
      ) : (
        <p className="text-xs text-amber-800">
          새 사용자 규칙은 저장 시 기본 비활성입니다. 미리보기 후 활성화하세요.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          저장
        </button>
        {rule ? (
          <button
            type="submit"
            formAction={deactivateCollectionRuleAction}
            name="id"
            value={rule.id}
            className="rounded-lg border border-amber-400 px-4 py-2 text-sm text-amber-900 hover:bg-amber-50"
          >
            비활성화
          </button>
        ) : null}
      </div>
      {rule?.isSystem ? (
        <p className="text-xs text-gray-500">시스템 seed — 삭제 대신 비활성화</p>
      ) : null}
    </form>
  );
}

export default async function CollectionRulesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [{ rules, schemaReady, error }, audit, previewCandidates] =
    await Promise.all([
      fetchEditorialCollectionRules(),
      fetchRecentEditorialAudit(50),
      fetchCandidatesForEditorialPreview(100),
    ]);

  const preview = previewEditorialRulesOnCandidates(
    previewCandidates.rows,
    rules.filter((r) => r.isActive),
    { limit: 100 }
  );

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold text-gray-500">관리자 / 수집 기준</p>
        <h1 className="mt-2 text-2xl font-bold">관리자 수집 기준 v1</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          무료 관리자 규칙 → 기존 AI 평가 → 관리자 최종 검토. 규칙
          “통과/우선”은 후보·검토로 보낸다는 뜻이며 자동 기사화·자동 공개가
          아닙니다. 이 화면에서는 외부 AI를 호출하지 않습니다.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          <Link href="/admin/collection-candidates" className="underline">
            수집 후보
          </Link>
          로 돌아가기
        </p>

        {!schemaReady ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            Migration 미적용 상태입니다. 수집은 기존 흐름으로 fail-open 되며
            규칙으로 자동 제외되지 않습니다. (
            <code>migrations/20260909_editorial_collection_controls_v2.sql</code>
            )
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            기준 조회 오류: {error}
          </div>
        ) : null}
        {params.saved ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
            저장했습니다. 미리보기를 확인한 뒤 활성화하세요.
          </div>
        ) : null}
        {params.deactivated ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
            규칙을 비활성화했습니다.
          </div>
        ) : null}
        {params.error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            {decodeURIComponent(params.error)}
          </div>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-bold">미리보기 (최근 후보 ≤100 · 읽기 전용)</h2>
          <p className="mt-1 text-sm text-gray-600">
            후보 상태를 바꾸지 않습니다. 활성 규칙만 적용합니다.
          </p>
          {previewCandidates.error ? (
            <p className="mt-2 text-sm text-red-700">
              미리보기 후보 조회 실패: {previewCandidates.error}
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-gray-200 p-4 text-sm">
              <p>스캔 {preview.scanned}건</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                <li>우선 검토: {preview.byAction.prioritize}</li>
                <li>항상 유지: {preview.byAction.always_keep}</li>
                <li>일반 검토: {preview.byAction.review}</li>
                <li>자동 제외 예상: {preview.byAction.exclude}</li>
                <li>일치 없음: {preview.byAction.none}</li>
                <li>중요 예외로 구조: {preview.rescuedCount}</li>
              </ul>
              <div className="mt-4 space-y-3">
                {(
                  ["exclude", "prioritize", "review", "always_keep"] as const
                ).map((action) => {
                  const samples = preview.samplesByAction[action] ?? [];
                  if (samples.length === 0) return null;
                  return (
                    <div key={action}>
                      <p className="font-medium">
                        {EDITORIAL_ACTION_LABELS[action]} 샘플
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-gray-700">
                        {samples.map((s) => (
                          <li key={`${action}-${s.title}`}>
                            {s.title}{" "}
                            <span className="text-xs text-gray-500">
                              ({s.reason})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">새 규칙</h2>
          <div className="mt-3">
            <RuleForm />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">저장된 규칙 {rules.length}개</h2>
          <div className="mt-3 space-y-4">
            {rules.map((rule) => (
              <div key={rule.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span className="rounded bg-gray-100 px-2 py-0.5">
                    {EDITORIAL_KIND_LABELS[rule.kind]}
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-0.5">
                    {EDITORIAL_ACTION_LABELS[rule.action]}
                  </span>
                  <span className="rounded bg-gray-100 px-2 py-0.5">
                    {EDITORIAL_REGION_LABELS[rule.region]}
                  </span>
                  <span>
                    {rule.isActive ? "활성" : "비활성"}
                    {rule.isSystem ? " · 시스템" : ""}
                  </span>
                  <form action={toggleCollectionRuleActiveAction}>
                    <input type="hidden" name="id" value={rule.id} />
                    <input
                      type="hidden"
                      name="isActive"
                      value={rule.isActive ? "0" : "1"}
                    />
                    <button
                      type="submit"
                      className="underline hover:text-black"
                    >
                      {rule.isActive ? "지금 비활성화" : "미리보기 후 활성화"}
                    </button>
                  </form>
                </div>
                <RuleForm rule={rule} />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold">최근 자동 제외 감사</h2>
          <p className="mt-1 text-sm text-gray-600">
            URL·짧은 제목·출처·지역·규칙만 저장합니다. 본문·요약·개인정보는
            저장하지 않습니다.
          </p>
          {audit.error ? (
            <p className="mt-2 text-sm text-red-700">{audit.error}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">시각</th>
                    <th className="p-2">출처</th>
                    <th className="p-2">지역</th>
                    <th className="p-2">제목</th>
                    <th className="p-2">규칙</th>
                    <th className="p-2">원문</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit.rows as Array<Record<string, string>>).map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("ko-KR", {
                          timeZone: "America/New_York",
                        })}
                      </td>
                      <td className="p-2">{row.source}</td>
                      <td className="p-2">{row.region || "-"}</td>
                      <td className="p-2">{row.title_excerpt}</td>
                      <td className="p-2">
                        {row.rule_name || row.reason}
                      </td>
                      <td className="p-2">
                        <a
                          href={row.original_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          열기
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
