"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  markShortsPackageReviewedAction,
  revertShortsPackageToDraftAction,
  saveShortsPackageDraftAction,
} from "../../actions";
import type {
  ShortsProductionPackageContent,
  ShortsProductionPackageRecord,
} from "@/lib/shorts/shortsPackageTypes";

function deskLabel(desk: ShortsProductionPackageRecord["desk"]): string {
  return desk === "morning" ? "한눈 아침뉴스" : "한눈 저녁뉴스";
}

export default function ShortsPackageEditor({
  record: initialRecord,
}: {
  record: ShortsProductionPackageRecord;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [pkg, setPkg] = useState<ShortsProductionPackageContent>(initialRecord.package);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const readOnly = record.status === "reviewed";

  function updateField<K extends keyof ShortsProductionPackageContent>(
    key: K,
    value: ShortsProductionPackageContent[K]
  ) {
    if (readOnly) return;
    setPkg((current) => ({ ...current, [key]: value }));
  }

  function updateScene(index: number, field: "subtitle" | "visualPlan", value: string) {
    if (readOnly) return;
    setPkg((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.index === index ? { ...scene, [field]: value } : scene
      ),
    }));
  }

  function save(status: "draft" | "reviewed") {
    if (readOnly) return;
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("packageId", record.id);
    formData.set("packageJson", JSON.stringify(pkg));

    startTransition(async () => {
      const action =
        status === "reviewed"
          ? markShortsPackageReviewedAction
          : saveShortsPackageDraftAction;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const nextStatus = status === "reviewed" ? "reviewed" : "draft";
      setRecord((current) => ({
        ...current,
        status: nextStatus,
        reviewedAt: nextStatus === "reviewed" ? new Date().toISOString() : null,
      }));
      setMessage(
        nextStatus === "reviewed"
          ? "검토 완료로 저장했습니다. (자동 공개되지 않습니다.)"
          : "초안을 저장했습니다."
      );
    });
  }

  function revertToDraft() {
    setMessage(null);
    setError(null);
    const formData = new FormData();
    formData.set("packageId", record.id);

    startTransition(async () => {
      const result = await revertShortsPackageToDraftAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecord((current) => ({
        ...current,
        status: "draft",
        reviewedAt: null,
      }));
      setMessage("초안으로 되돌렸습니다. 이제 수정·저장할 수 있습니다.");
    });
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            {deskLabel(record.desk)} · {record.editDate} · 생성{" "}
            {new Intl.DateTimeFormat("ko-KR", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(record.generatedAt))}
          </p>
          <p className="mt-1 text-sm">
            상태:{" "}
            <span
              className={
                record.status === "reviewed"
                  ? "font-semibold text-green-700"
                  : "font-semibold text-amber-700"
              }
            >
              {record.status === "reviewed" ? "검토 완료 (읽기 전용)" : "초안"}
            </span>
            {" · "}
            생성 방식:{" "}
            {record.generationMode === "openai"
              ? "AI 생성"
              : "테스트 생성 · OpenAI 미사용"}
          </p>
        </div>
        <Link
          href="/admin/shorts"
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          ← Shorts 제작실
        </Link>
      </div>

      {readOnly ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          검토 완료 상태입니다. 내용을 수정하려면 「초안으로 되돌리기」를 먼저 실행하세요.
          자동 공개·업로드는 없습니다.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-gray-200 p-5">
        <label className="block text-sm font-medium">
          Shorts 제목
          <input
            value={pkg.title}
            onChange={(e) => updateField("title", e.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2"
            disabled={pending || readOnly}
          />
        </label>
        <label className="block text-sm font-medium">
          Hook
          <textarea
            value={pkg.hook}
            onChange={(e) => updateField("hook", e.target.value)}
            rows={2}
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2"
            disabled={pending || readOnly}
          />
        </label>
        <label className="block text-sm font-medium">
          전체 나레이션
          <textarea
            value={pkg.narration}
            onChange={(e) => updateField("narration", e.target.value)}
            rows={8}
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-sm"
            disabled={pending || readOnly}
          />
        </label>
        <label className="block text-sm font-medium">
          예상 영상 길이 (초)
          <input
            type="number"
            min={60}
            max={90}
            value={pkg.estimatedDurationSec}
            onChange={(e) =>
              updateField("estimatedDurationSec", Number(e.target.value) || 0)
            }
            className="mt-2 w-40 rounded-xl border border-gray-300 px-3 py-2"
            disabled={pending || readOnly}
          />
        </label>
      </section>

      <section>
        <h2 className="text-lg font-semibold">장면별 자막 · 화면 구성</h2>
        <div className="mt-4 space-y-4">
          {pkg.scenes.map((scene) => (
            <div
              key={scene.index}
              className="rounded-2xl border border-gray-200 p-4"
            >
              <p className="text-sm font-semibold text-gray-500">장면 {scene.index}</p>
              <label className="mt-2 block text-sm font-medium">
                자막
                <textarea
                  value={scene.subtitle}
                  onChange={(e) => updateScene(scene.index, "subtitle", e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                  disabled={pending || readOnly}
                />
              </label>
              <label className="mt-3 block text-sm font-medium">
                화면 구성안
                <textarea
                  value={scene.visualPlan}
                  onChange={(e) => updateScene(scene.index, "visualPlan", e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
                  disabled={pending || readOnly}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">기사별 미디어 제안</h2>
        <ul className="mt-4 space-y-3">
          {pkg.articleMediaSuggestions.map((item) => (
            <li
              key={item.articleId}
              className="rounded-xl border border-gray-200 p-4 text-sm"
            >
              <p className="font-semibold">{item.title}</p>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-blue-600 underline"
                >
                  한눈 기사
                </a>
              ) : null}
              <p className="mt-2 text-gray-600">이미지: {item.imageSuggestion}</p>
              <p className="mt-1 text-gray-600">영상: {item.videoSuggestion}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">출처 기사</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {pkg.sourceArticles.map((source) => (
            <li key={source.articleId} className="rounded-xl border border-gray-200 px-4 py-3">
              <span className="font-medium">{source.title}</span>
              {source.sourceDisplayName ? (
                <span className="text-gray-500"> · {source.sourceDisplayName}</span>
              ) : null}
              {source.hannoonUrl ? (
                <>
                  {" · "}
                  <a
                    href={source.hannoonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    한눈
                  </a>
                </>
              ) : null}
              {source.originalUrl ? (
                <>
                  {" · "}
                  <a
                    href={source.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    원문
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3 pb-10">
        {readOnly ? (
          <button
            type="button"
            disabled={pending}
            onClick={revertToDraft}
            className="rounded-xl border border-amber-600 px-5 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-50"
          >
            {pending ? "처리 중…" : "초안으로 되돌리기"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => save("draft")}
              className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {pending ? "저장 중…" : "초안 저장"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => save("reviewed")}
              className="rounded-xl border border-green-600 px-5 py-2.5 text-sm font-semibold text-green-700 disabled:opacity-50"
            >
              검토 완료로 표시
            </button>
          </>
        )}
      </div>
    </div>
  );
}
