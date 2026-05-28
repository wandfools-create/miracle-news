"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import FromLinkDiagnosticsPanel from "./FromLinkDiagnosticsPanel";
import TranscriptDiagnosticPanel from "./TranscriptDiagnosticPanel";
import { analyzeFromLink, commitFromLinkDrafts } from "./actions";
import { DUPLICATE_LINK_MESSAGE } from "@/lib/from-link/actionTypes";
import { BODY_EXTRACTION_FAILED_METHOD } from "@/lib/from-link/constants";
import type { FromLinkAnalyzeDiagnostics } from "@/lib/from-link/fromLinkDiagnostics";

const BODY_PREVIEW_CHARS = 500;
import type { TranscriptDiagnostic } from "@/lib/from-link/transcriptDiagnostic";
import type { ExtractedPreview } from "@/lib/from-link/types";
import type { LinkType } from "@/lib/from-link/types";
import type { ArticleDraftPayload, DraftCandidate } from "@/lib/from-link/types";

type LastRun =
  | {
      kind: "success";
      linkType: LinkType;
      linkTypeLabel: string;
      extracted: ExtractedPreview;
      transcript: TranscriptDiagnostic;
      articleDraft: ArticleDraftPayload;
      candidates: DraftCandidate[];
      diagnostics: FromLinkAnalyzeDiagnostics;
    }
  | {
      kind: "failed";
      error: string;
      linkType: LinkType;
      linkTypeLabel: string;
      extracted: ExtractedPreview;
      transcript: TranscriptDiagnostic;
      diagnostics?: FromLinkAnalyzeDiagnostics;
    };

export default function FromLinkWizard() {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState("");
  const [supplementalInput, setSupplementalInput] = useState("");
  const [allowShortSourceDraft, setAllowShortSourceDraft] = useState(false);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [duplicateArticleId, setDuplicateArticleId] = useState<string | null>(
    null
  );
  const [isAnalyzing, startAnalyze] = useTransition();
  const [isSaving, startSave] = useTransition();

  const successRun = lastRun?.kind === "success" ? lastRun : null;

  function handleAnalyze() {
    setError(null);
    setDuplicateArticleId(null);
    setLastRun(null);
    setSelectedIds(new Set());
    startAnalyze(async () => {
      const res = await analyzeFromLink(urlInput, supplementalInput, {
        allowShortSourceDraft,
      });
      if (!res.ok) {
        if (
          res.transcript &&
          res.extracted &&
          res.linkType &&
          res.linkTypeLabel
        ) {
          setLastRun({
            kind: "failed",
            error: res.error,
            linkType: res.linkType,
            linkTypeLabel: res.linkTypeLabel,
            extracted: res.extracted,
            transcript: res.transcript,
            diagnostics: res.diagnostics,
          });
        } else {
          setLastRun(null);
        }
        setError(res.error);
        return;
      }
      setLastRun({
        kind: "success",
        linkType: res.linkType,
        linkTypeLabel: res.linkTypeLabel,
        extracted: res.extracted,
        transcript: res.transcript,
        articleDraft: res.articleDraft,
        candidates: res.candidates,
        diagnostics: res.diagnostics,
      });
      setError(null);
    });
  }

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    if (!successRun || selectedIds.size === 0) {
      setError("저장할 후보를 하나 이상 선택해 주세요.");
      return;
    }
    const candidates = successRun.candidates.filter((c) =>
      selectedIds.has(c.id)
    );
    if (candidates.length !== selectedIds.size) {
      setError("선택한 후보를 찾을 수 없습니다. 다시 분석해 주세요.");
      return;
    }
    setError(null);
    setDuplicateArticleId(null);
    startSave(async () => {
      const res = await commitFromLinkDrafts({
        submittedOriginalUrl: successRun.extracted.submittedOriginalUrl,
        linkType: successRun.linkType,
        extracted: successRun.extracted,
        articleDraft: successRun.articleDraft,
        candidates,
      });
      if (!res.ok) {
        if (res.duplicateArticleId) {
          setDuplicateArticleId(res.duplicateArticleId);
          setError(res.error || DUPLICATE_LINK_MESSAGE);
          return;
        }
        console.error("[from-link] commitFromLinkDrafts failed", {
          error: res.error,
          step: res.step,
          code: res.code,
          hint: res.hint,
          details: res.details,
          articleIds: res.articleIds,
        });
        setDuplicateArticleId(null);
        setError(res.error);
        return;
      }
      if (res.articleIds.length === 1) {
        router.push(`/admin/review/${res.articleIds[0]}`);
      } else {
        router.push("/admin/review");
      }
    });
  }

  function resetWizard() {
    setLastRun(null);
    setSelectedIds(new Set());
    setError(null);
    setDuplicateArticleId(null);
    setSupplementalInput("");
    setAllowShortSourceDraft(false);
  }

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">1. 링크 입력</h2>
        <p className="mt-2 text-sm text-gray-600">
          공개되지 않으며, 저장 시에도 검토 대기 상태로만 들어갑니다.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <label className="block text-sm font-medium text-gray-800">
            URL
            <input
              type="url"
              name="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-black"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-gray-800">
            원문 보강 텍스트
            <span className="ml-1 font-normal text-gray-500">(선택)</span>
            <textarea
              name="supplementalText"
              value={supplementalInput}
              onChange={(e) => setSupplementalInput(e.target.value)}
              placeholder="링크에서 본문·자막이 잘 안 잡힐 때, 기사 원문·발췌·자막 등을 붙여 넣으세요. 추출 내용과 함께 요약·본문·후보 생성에 사용됩니다."
              rows={6}
              className="mt-2 w-full resize-y rounded-xl border border-gray-300 px-4 py-3 text-sm leading-relaxed outline-none focus:border-black"
            />
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
            <input
              type="checkbox"
              checked={allowShortSourceDraft}
              onChange={(e) => setAllowShortSourceDraft(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-300"
            />
            <span>
              <span className="font-medium">짧은 원문 기반 초안 허용</span>
              <span className="mt-1 block text-xs text-amber-900/90">
                추출 원문이 400자 이상인데 AI 생성 본문이 900자·5문단 기준을
                못 맞출 때도 초안을 만들고, 저장 시 「짧은 원문 기반 초안」
                경고를 남깁니다.
              </span>
            </span>
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !urlInput.trim()}
              className="rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isAnalyzing ? "분석 중…" : "분석 · 후보 생성"}
            </button>
          </div>
        </div>
      </section>

      {lastRun ? (
        <>
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">2. 링크 유형 · 추출 미리보기</h2>
            <p className="mt-2 text-sm text-gray-600">
              제목·메타와 함께 기사 본문 추출 결과를 확인합니다. 서버 콘솔에도 추출 길이·미리보기가
              기록됩니다.
            </p>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  링크 유형
                </dt>
                <dd className="mt-1 font-medium text-gray-900">
                  {lastRun.linkTypeLabel}
                </dd>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 md:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  입력 URL (저장 · 원문 링크)
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-gray-800">
                  {lastRun.extracted.submittedOriginalUrl}
                </dd>
              </div>
              {lastRun.extracted.title ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 md:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    제목(추출)
                  </dt>
                  <dd className="mt-1 text-gray-900">{lastRun.extracted.title}</dd>
                </div>
              ) : null}
              {lastRun.extracted.description ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 md:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    설명(메타)
                  </dt>
                  <dd className="mt-1 text-gray-800">{lastRun.extracted.description}</dd>
                </div>
              ) : null}
              {(() => {
                const bodyOk =
                  lastRun.extracted.articleBodyExtractSuccess === true &&
                  Boolean(lastRun.extracted.articleBodyPlain?.trim());
                const bodyLen =
                  lastRun.extracted.articleBodyPlain?.length ?? 0;
                const method = lastRun.extracted.articleBodyExtractMethod;
                const failed =
                  !bodyOk ||
                  method === BODY_EXTRACTION_FAILED_METHOD;

                return (
                  <div
                    className={`rounded-xl border p-4 md:col-span-2 ${
                      failed
                        ? "border-red-200 bg-red-50"
                        : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      본문(추출)
                    </dt>
                    <dd className="mt-1 space-y-2 text-gray-800">
                      {failed ? (
                        <p className="text-sm font-semibold text-red-800">
                          본문 추출 실패
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-green-800">
                          본문 추출 성공
                        </p>
                      )}
                      <p className="text-sm">
                        <span className="font-medium">
                          {bodyLen.toLocaleString("ko-KR")}자
                        </span>
                        {method ? (
                          <span className="text-gray-500"> · 방식: {method}</span>
                        ) : null}
                        {lastRun.extracted.pageFetchMethod ? (
                          <span className="text-gray-500">
                            {" "}
                            · 페이지 로드:{" "}
                            {lastRun.extracted.pageFetchMethod === "playwright"
                              ? "Playwright"
                              : "HTTP"}
                          </span>
                        ) : null}
                      </p>
                      {bodyOk && lastRun.extracted.articleBodyPlain ? (
                        <>
                          <p className="text-xs text-gray-500">
                            미리보기 (앞 {BODY_PREVIEW_CHARS}자)
                          </p>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700">
                            {lastRun.extracted.articleBodyPlain.slice(
                              0,
                              BODY_PREVIEW_CHARS
                            )}
                            {bodyLen > BODY_PREVIEW_CHARS ? "…" : ""}
                          </pre>
                        </>
                      ) : (
                        <p className="text-sm text-red-800/90">
                          og:description 등 메타만으로는 기사를 생성하지 않습니다. 원문 보강
                          텍스트를 붙이거나 다른 URL을 시도해 주세요.
                        </p>
                      )}
                    </dd>
                  </div>
                );
              })()}
              {lastRun.extracted.publishedAt ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    원문 발행 시각(추출)
                  </dt>
                  <dd className="mt-1 font-mono text-xs text-gray-800">
                    {lastRun.extracted.publishedAt}
                  </dd>
                </div>
              ) : null}
              {lastRun.extracted.contentLanguage !== "unknown" ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    원문 언어(추정)
                  </dt>
                  <dd className="mt-1 text-gray-900">
                    {lastRun.extracted.contentLanguage === "en" ? "영어" : "한국어"}
                  </dd>
                </div>
              ) : null}
              {lastRun.extracted.author ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    채널
                  </dt>
                  <dd className="mt-1 text-gray-900">{lastRun.extracted.author}</dd>
                </div>
              ) : null}
              <div className="md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  썸네일
                </p>
                {lastRun.extracted.thumbnailUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={lastRun.extracted.thumbnailUrl}
                    alt=""
                    className="mt-2 max-h-40 rounded-lg border object-contain"
                  />
                ) : (
                  <div className="mt-2 flex max-h-40 min-h-[6rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 text-center text-sm text-gray-500">
                    <span>이미지 없음</span>
                    <span className="text-xs text-gray-400">
                      저장 시 뉴스 스타일 AI 일러스트 썸네일 자동 생성
                    </span>
                  </div>
                )}
              </div>
              {lastRun.extracted.extractNote ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 md:col-span-2 text-sm text-amber-900">
                  {lastRun.extracted.extractNote}
                </div>
              ) : null}
            </dl>
          </section>

          <TranscriptDiagnosticPanel transcript={lastRun.transcript} />

          {lastRun.diagnostics ? (
            <FromLinkDiagnosticsPanel
              diagnostics={lastRun.diagnostics}
              showShortSourceHint={
                lastRun.kind === "failed" &&
                lastRun.diagnostics.canAllowShortSourceDraft &&
                !allowShortSourceDraft
              }
            />
          ) : null}

          {successRun ? (
            <>
              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">4. 핵심 요약 · 본문 초안</h2>
                <p className="mt-2 text-sm text-gray-600">
                  핵심 요약(1~2문장)과 본문(5문단 이상)은 구분되어 저장됩니다. 검토 후
                  편집해 주세요.
                </p>
                {successRun.articleDraft.shortSourceDraft ? (
                  <div
                    className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                    role="status"
                  >
                    <p className="font-semibold">짧은 원문 기반 초안</p>
                    <p className="mt-1 text-amber-900/90">
                      원문은 확보됐지만 생성 본문이 일반 품질 기준(900자·5문단)을
                      충족하지 못해 완화 모드로 생성했습니다. 저장 시 검토 메모에
                      경고가 기록됩니다.
                    </p>
                  </div>
                ) : null}
                {successRun.articleDraft.summaryKo ? (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                      핵심 요약
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-900">
                      {successRun.articleDraft.summaryKo}
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    본문
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
                    {successRun.articleDraft.synthesizedBodyKo}
                  </p>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  원문 보기 링크:{" "}
                  <a
                    href={successRun.extracted.submittedOriginalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-blue-600 underline"
                  >
                    {successRun.extracted.submittedOriginalUrl}
                  </a>
                </p>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold">5. 기사 후보 선택 (다중)</h2>
                <p className="mt-2 text-sm text-gray-600">
                  원하는 후보를 여러 개 선택하면 각각 별도의 검토 대기 기사로 저장됩니다.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {successRun.candidates.map((c) => {
                    const checked = selectedIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`cursor-pointer rounded-2xl border p-5 shadow-sm transition hover:bg-gray-50 ${
                          checked
                            ? "border-black ring-1 ring-black"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            name="candidate"
                            value={c.id}
                            checked={checked}
                            onChange={() => toggleCandidate(c.id)}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {c.angle}
                            </p>
                            <p className="mt-2 font-semibold text-gray-900">{c.title}</p>
                            <p className="mt-2 text-sm text-gray-600">
                              {c.summary_one_line}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || selectedIds.size === 0}
                    className="rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {isSaving
                      ? "저장 중…"
                      : selectedIds.size > 1
                        ? `검토 대기로 저장 (${selectedIds.size}건)`
                        : "검토 대기로 저장"}
                  </button>
                  <button
                    type="button"
                    onClick={resetWizard}
                    className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    처음부터
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={resetWizard}
                className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              >
                처음부터
              </button>
            </div>
          )}
        </>
      ) : null}

      {duplicateArticleId ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
          role="status"
        >
          <p className="font-semibold">
            {error || DUPLICATE_LINK_MESSAGE}
          </p>
          <p className="mt-2 text-amber-900/90">
            같은 URL로 이미 검토 대기(또는 저장된) 기사가 있습니다. 아래에서
            기존 기사를 열어 확인하거나 수정할 수 있습니다.
          </p>
          <Link
            href={`/admin/review/${duplicateArticleId}`}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-amber-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-950"
          >
            저장된 기사 보기
          </Link>
        </div>
      ) : error ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <p className="whitespace-pre-wrap font-medium">{error}</p>
          <p className="mt-2 text-xs text-red-700">
            자세한 내용은 브라우저 개발자 도구 콘솔의{" "}
            <code className="rounded bg-red-100 px-1">[from-link]</code> /{" "}
            <code className="rounded bg-red-100 px-1">[commitFromLinkDraft]</code>{" "}
            로그를 확인하세요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
