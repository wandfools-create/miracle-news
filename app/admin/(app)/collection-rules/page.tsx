import Link from "next/link";

import {
  deactivateCollectionRuleAction,
  saveCollectionFieldProfileAction,
  saveCollectionRuleAction,
  toggleCollectionRuleActiveAction,
} from "@/app/admin/(app)/collection-rules/actions";
import { fetchCollectionFieldProfile } from "@/lib/editorial-rules/collectionProfileStore";
import {
  evaluateCollectionFieldProfile,
  shouldAutoExcludeFieldDecision,
} from "@/lib/editorial-rules/evaluateCollectionFieldProfile";
import {
  fetchEditorialCollectionRules,
  fetchRecentEditorialAudit,
} from "@/lib/editorial-rules/editorialRuleStore";
import { fetchCandidatesForEditorialPreview } from "@/lib/editorial-rules/fetchPreviewCandidates";
import {
  COLLECTION_REALM_LABELS,
  COLLECTION_REALM_ORDER,
  COLLECTION_REGION_SCOPE_LABELS,
  type CollectionFieldRealm,
  type CollectionRegionScope,
} from "@/lib/editorial-rules/fieldTaxonomy";
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
    advanced?: string;
    preview?: string;
  }>;
};

const SOURCE_OPTIONS = Array.from(
  new Set(RSS_FEED_SOURCES.map((f) => f.sourceKey))
).sort();

function RuleForm({ rule }: { rule?: EditorialCollectionRule }) {
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
        키워드 (쉼표 또는 줄바꿈)
        <textarea
          name="keywords"
          rows={2}
          defaultValue={rule?.keywords.join(", ") ?? ""}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          카테고리
          <input
            name="category"
            defaultValue={rule?.category ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          출처
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
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmSourceWideExclude"
          value="1"
          className="mt-1"
        />
        출처 전체 자동 제외 확인
      </label>
      {!isNew ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            value="1"
            defaultChecked={rule?.isActive}
          />
          활성화
        </label>
      ) : (
        <p className="text-xs text-amber-800">
          새 고급 규칙은 저장 시 기본 비활성입니다.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          고급 규칙 저장
        </button>
        {rule ? (
          <button
            type="submit"
            formAction={deactivateCollectionRuleAction}
            name="id"
            value={rule.id}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            비활성화
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default async function CollectionRulesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const showPreview = params.preview === "1";
  const showAdvanced = params.advanced === "1";

  const [{ profile, error: profileError }, { rules, schemaReady }, audit, previewCandidates] =
    await Promise.all([
      fetchCollectionFieldProfile(),
      fetchEditorialCollectionRules(),
      fetchRecentEditorialAudit(40),
      showPreview
        ? fetchCandidatesForEditorialPreview(80)
        : Promise.resolve({ rows: [], error: null }),
    ]);

  const fieldsByRealm = COLLECTION_REALM_ORDER.map((realm) => ({
    realm,
    fields: profile.fields.filter(
      (f) => f.realm === realm && !f.deletedAt
    ),
  }));

  let previewExclude = 0;
  let previewReview = 0;
  let previewAllow = 0;
  const previewSamples: Array<{ title: string; reason: string }> = [];
  if (showPreview && profile.schemaReady) {
    for (const row of previewCandidates.rows) {
      const decision = evaluateCollectionFieldProfile(
        {
          title: row.title,
          summary: row.summary,
          categories: row.categories,
          collectRegion: row.collectRegion,
        },
        profile
      );
      if (shouldAutoExcludeFieldDecision(decision)) {
        previewExclude += 1;
        if (previewSamples.length < 8) {
          previewSamples.push({
            title: row.title.slice(0, 80),
            reason: decision.reason,
          });
        }
      } else if (decision.action === "review") {
        previewReview += 1;
      } else {
        previewAllow += 1;
      }
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold text-gray-500">관리자 / 수집 기준</p>
        <h1 className="mt-2 text-2xl font-bold">수집할 분야 선택</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          관리자는 수집할 분야와 국가만 선택합니다. 선택된 기사 안의 중요도·검토
          순서는 기존 AI가 판단합니다. 자동 기사화·자동 공개는 하지 않습니다.
        </p>
        <p className="mt-2 text-sm text-gray-600">
          <Link href="/admin/collection-candidates" className="underline">
            수집 후보
          </Link>
          {" · "}
          <Link
            href={showPreview ? "/admin/collection-rules" : "/admin/collection-rules?preview=1"}
            className="underline"
          >
            {showPreview ? "미리보기 닫기" : "미리보기 (선택)"}
          </Link>
        </p>

        {!profile.schemaReady ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            분야 프로필 migration 미적용 — 화면 기본값만 표시되며 분야 제외는
            수집에 반영되지 않습니다 (
            <code>migrations/20260910_editorial_collection_field_profile.sql</code>
            ). 기존 규칙 엔진(
            <code>20260909_editorial_collection_controls_v2.sql</code>
            )은 그대로 동작합니다.
          </div>
        ) : null}
        {!schemaReady ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            기존 규칙 테이블 migration 미적용 상태입니다.
          </div>
        ) : null}
        {profileError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            프로필 조회 오류: {profileError}
          </div>
        ) : null}
        {params.saved ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
            저장했습니다.
          </div>
        ) : null}
        {params.error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            {decodeURIComponent(params.error)}
          </div>
        ) : null}

        {showPreview ? (
          <section className="mt-6 rounded-xl border border-gray-200 p-4 text-sm">
            <h2 className="font-bold">미리보기 (읽기 전용 · 최근 후보)</h2>
            <p className="mt-1 text-gray-600">
              스캔 {previewCandidates.rows.length} · 받을 예정 {previewAllow} ·
              일반 검토 {previewReview} · 제외 예상 {previewExclude}
            </p>
            <ul className="mt-2 list-disc pl-5 text-gray-700">
              {previewSamples.map((s) => (
                <li key={`${s.title}-${s.reason}`}>
                  {s.title}{" "}
                  <span className="text-xs text-gray-500">({s.reason})</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <form action={saveCollectionFieldProfileAction} className="mt-8 space-y-8">
          <section className="rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-bold">1. 지역·국가</h2>
            <p className="mt-1 text-sm text-gray-600">
              국가를 확실히 판별하지 못하면 국가별 제외 규칙은 적용하지 않고
              일반 검토합니다. 내부적으로 ISO 국가코드를 사용합니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {(
                Object.keys(COLLECTION_REGION_SCOPE_LABELS) as CollectionRegionScope[]
              ).map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="regionScope"
                    value={scope}
                    defaultChecked={profile.regionScope === scope}
                  />
                  {COLLECTION_REGION_SCOPE_LABELS[scope]}
                </label>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {profile.countries
                .filter((c) => !c.deletedAt)
                .map((country) => (
                  <div
                    key={country.iso}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                  >
                    <input type="hidden" name="countryIso" value={country.iso} />
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-semibold">
                        {country.nameKo} ({country.iso})
                      </span>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          name={`countryEnabled:${country.iso}`}
                          value="1"
                          defaultChecked={country.enabled}
                        />
                        사용
                      </label>
                      <label className="flex items-center gap-1 text-red-800">
                        <input
                          type="checkbox"
                          name={`deleteCountry:${country.iso}`}
                          value="1"
                        />
                        삭제
                      </label>
                    </div>
                    <input
                      type="hidden"
                      name={`countryName:${country.iso}`}
                      value={country.nameKo}
                    />
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs">
                        수집 키워드
                        <textarea
                          name={`countryCollect:${country.iso}`}
                          rows={2}
                          defaultValue={country.collectKeywords.join(", ")}
                          className="mt-1 w-full rounded border px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        제외 키워드
                        <textarea
                          name={`countryExclude:${country.iso}`}
                          rows={2}
                          defaultValue={country.excludeKeywords.join(", ")}
                          className="mt-1 w-full rounded border px-2 py-1 text-sm"
                        />
                      </label>
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-4 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">국가 추가</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs">
                  ISO 코드 (예: JP)
                  <input
                    name="newCountryIso"
                    maxLength={2}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm uppercase"
                  />
                </label>
                <label className="text-xs">
                  표시 이름
                  <input
                    name="newCountryName"
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs sm:col-span-1">
                  수집 키워드
                  <textarea
                    name="newCountryCollect"
                    rows={2}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    placeholder="일본, Japan, Tokyo"
                  />
                </label>
                <label className="text-xs">
                  제외 키워드
                  <textarea
                    name="newCountryExclude"
                    rows={2}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-bold">2. 수집할 분야</h2>
            <p className="mt-1 text-sm text-gray-600">
              체크됨 = 수집 후보로 받음 · 체크 해제 = 본문 추출·AI 보강 전에 제외.
              사상자·대형 재난·전쟁·정부 정책·국제 안보·감염병·인권 신호가 있으면
              체크 해제여도 일반 검토로 구조합니다. 여러 분야 동시 일치·낮은
              신뢰도는 자동 제외하지 않습니다.
            </p>

            <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm">
              <input
                type="checkbox"
                name="acceptUnclassified"
                value="1"
                defaultChecked={profile.acceptUnclassified}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">미분류 기사도 받기</span>
                <span className="block text-gray-600">
                  기본 OFF. 끄면 분야에 안 걸린 후보는 제외(감사 기록)합니다.
                </span>
              </span>
            </label>

            <div className="mt-6 space-y-6">
              {fieldsByRealm.map(({ realm, fields }) => (
                <div key={realm}>
                  <h3 className="text-base font-semibold">
                    {COLLECTION_REALM_LABELS[realm]}
                  </h3>
                  <ul className="mt-2 space-y-3">
                    {fields.map((field) => (
                      <li
                        key={field.id}
                        className="rounded-lg border border-gray-100 p-3"
                      >
                        <input type="hidden" name="fieldId" value={field.id} />
                        {field.isCustom ? (
                          <>
                            <input
                              type="hidden"
                              name="customFieldId"
                              value={field.id}
                            />
                            <input
                              type="hidden"
                              name={`customRealm:${field.id}`}
                              value={field.realm}
                            />
                            <input
                              type="hidden"
                              name={`customLabel:${field.id}`}
                              value={field.labelKo}
                            />
                          </>
                        ) : null}
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            name="enabledFieldIds"
                            value={field.id}
                            defaultChecked={field.enabled}
                          />
                          {field.labelKo}
                          {field.isCustom ? (
                            <span className="text-xs font-normal text-gray-500">
                              (사용자 정의)
                            </span>
                          ) : null}
                        </label>
                        <details className="mt-2 text-xs text-gray-600">
                          <summary className="cursor-pointer">키워드</summary>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <label>
                              수집 키워드
                              <textarea
                                name={`collectKeywords:${field.id}`}
                                rows={2}
                                defaultValue={field.collectKeywords.join(", ")}
                                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                              />
                            </label>
                            <label>
                              제외 키워드
                              <textarea
                                name={`excludeKeywords:${field.id}`}
                                rows={2}
                                defaultValue={field.excludeKeywords.join(", ")}
                                className="mt-1 w-full rounded border px-2 py-1 text-sm"
                              />
                            </label>
                          </div>
                        </details>
                        {field.isCustom ? (
                          <label className="mt-2 flex items-center gap-2 text-xs text-red-800">
                            <input
                              type="checkbox"
                              name={`deleteCustom:${field.id}`}
                              value="1"
                            />
                            이 세부 분야 삭제 (소프트 삭제)
                          </label>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500">
                            기본 분야는 삭제할 수 없고 체크만 해제합니다.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 rounded-lg border border-dashed p-3">
                    <p className="text-sm font-medium">
                      {COLLECTION_REALM_LABELS[realm]} · 세부 분야 추가
                    </p>
                    <p className="text-xs text-gray-500">
                      아래에서 대분류를 이 섹션으로 맞춘 뒤 한 번에 저장하세요.
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold">세부 분야 추가 (저장 시 반영)</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs">
                  대분류
                  <select
                    name="newCustomRealm"
                    defaultValue={"politics" satisfies CollectionFieldRealm}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  >
                    {COLLECTION_REALM_ORDER.map((realm) => (
                      <option key={realm} value={realm}>
                        {COLLECTION_REALM_LABELS[realm]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  이름
                  <input
                    name="newCustomLabel"
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                    placeholder="예: 지방자치"
                  />
                </label>
                <label className="text-xs">
                  수집 키워드
                  <textarea
                    name="newCustomCollect"
                    rows={2}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs">
                  제외 키워드
                  <textarea
                    name="newCustomExclude"
                    rows={2}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </div>
          </section>

          <div className="sticky bottom-4 z-10 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-gray-800"
            >
              한 번에 저장
            </button>
          </div>
        </form>

        <section className="mt-10">
          <h2 className="text-lg font-bold">최근 자동 제외 감사</h2>
          <p className="mt-1 text-sm text-gray-600">
            제목·URL·출처·제외 이유만 기록합니다. 후보 행은 삭제하지 않습니다.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">시각</th>
                  <th className="p-2">출처</th>
                  <th className="p-2">제목</th>
                  <th className="p-2">이유</th>
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
                    <td className="p-2">{row.title_excerpt}</td>
                    <td className="p-2">{row.reason || row.rule_name}</td>
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
        </section>

        <details className="mt-10 rounded-xl border border-gray-200 p-4" open={showAdvanced}>
          <summary className="cursor-pointer text-lg font-bold">
            고급: 기존 규칙 엔진 (접힘)
          </summary>
          <p className="mt-2 text-sm text-gray-600">
            우선순위·출처 단위 규칙 등 기존 필터 엔진입니다. 일반 운영은 위 분야
            선택만 사용하세요. AI 중요도 점수는 여기서 바꾸지 않습니다.
          </p>
          <div className="mt-4">
            <RuleForm />
          </div>
          <div className="mt-4 space-y-4">
            {rules.map((rule) => (
              <div key={rule.id} className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs text-gray-600">
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
                    <button type="submit" className="underline">
                      {rule.isActive ? "비활성화" : "활성화"}
                    </button>
                  </form>
                </div>
                <RuleForm rule={rule} />
              </div>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}
