"use client";

import {
  FROM_LINK_QUALITY_LIMITS,
  type FromLinkAnalyzeDiagnostics,
} from "@/lib/from-link/fromLinkDiagnostics";

type Props = {
  diagnostics: FromLinkAnalyzeDiagnostics;
  showShortSourceHint?: boolean;
};

export default function FromLinkDiagnosticsPanel({
  diagnostics,
  showShortSourceHint = false,
}: Props) {
  const { extraction: ex } = diagnostics;

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">추출 · 품질 진단</h2>
      <p className="mt-2 text-sm text-slate-600">
        HTTP·Playwright 각각의 본문 길이, AI에 넘긴 원문 크기, 품질 검사 항목별
        통과 여부입니다.
      </p>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-xl border border-white bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            HTTP 추출 글자 수
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {ex.httpBodyChars.toLocaleString("ko-KR")}자
            {ex.httpExtractMethod ? (
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({ex.httpExtractMethod}
                {ex.httpExtractSuccess ? " · 성공" : " · 부족"})
              </span>
            ) : null}
          </dd>
        </div>
        <div className="rounded-xl border border-white bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Playwright 추출 글자 수
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {ex.playwrightBodyChars.toLocaleString("ko-KR")}자
            {ex.playwrightExtractMethod ? (
              <span className="ml-2 text-xs font-normal text-slate-500">
                ({ex.playwrightExtractMethod}
                {ex.playwrightExtractSuccess ? " · 성공" : " · 부족"})
              </span>
            ) : null}
          </dd>
        </div>
        <div className="rounded-xl border border-white bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            최종 AI 원문 자료 글자 수
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {diagnostics.finalMaterialChars.toLocaleString("ko-KR")}자
            <span className="ml-2 text-xs font-normal text-slate-500">
              (보강 {diagnostics.supplementalChars.toLocaleString("ko-KR")}자 ·
              본문 {diagnostics.finalBodyChars.toLocaleString("ko-KR")}자)
            </span>
          </dd>
        </div>
        <div className="rounded-xl border border-white bg-white p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            생성 본문(한글) 글자 수
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {diagnostics.generatedBodyKoChars.toLocaleString("ko-KR")}자
            <span className="ml-2 text-xs font-normal text-slate-500">
              (최소 {FROM_LINK_QUALITY_LIMITS.minGeneratedBodyKoChars}자 · 권장
              목표 {FROM_LINK_QUALITY_LIMITS.targetGeneratedBodyKoCharsMin}–
              {FROM_LINK_QUALITY_LIMITS.targetGeneratedBodyKoCharsMax}자)
            </span>
          </dd>
        </div>
      </dl>

      {diagnostics.bodyPreview800 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            추출 본문 미리보기 (앞 800자)
          </p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
            {diagnostics.bodyPreview800}
            {diagnostics.finalBodyChars > 800 ? "…" : ""}
          </pre>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">추출된 본문이 없습니다.</p>
      )}

      {diagnostics.qualityChecks.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            품질 검사
          </p>
          <ul className="mt-2 space-y-2">
            {diagnostics.qualityChecks.map((check) => (
              <li
                key={check.id}
                className={`flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  check.passed
                    ? "border-green-200 bg-green-50/80 text-green-950"
                    : check.severity === "warn"
                      ? "border-amber-200 bg-amber-50/80 text-amber-950"
                      : "border-red-200 bg-red-50/80 text-red-950"
                }`}
              >
                <span className="font-medium">{check.label}</span>
                <span className="text-xs">
                  {check.passed
                    ? "통과"
                    : check.severity === "warn"
                      ? "경고"
                      : "미통과"}{" "}
                  · {check.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showShortSourceHint && diagnostics.canAllowShortSourceDraft ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          원문은 {FROM_LINK_QUALITY_LIMITS.minSourceBodyChars}자 이상이지만 생성
          본문이 최소 길이(
          {FROM_LINK_QUALITY_LIMITS.minGeneratedBodyKoChars}자) 또는 내용 품질
          기준을 충족하지 못했습니다. 아래 옵션을 켜고 다시 「분석」하면 짧은 원문
          기반 초안으로 진행할 수 있습니다.
        </p>
      ) : null}
    </section>
  );
}
