"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";

import {
  restorePublishedFromRevisionByIdsAction,
  type RestorePublishedActionResult,
} from "@/app/admin/(app)/revision/actions";
import { restorePublishedConfirmMessage } from "@/lib/admin/restorePublishedFromRevision";

type Props = {
  mode: "single" | "bulk";
  /** Required for single mode. */
  articleId?: string;
  checkboxName?: string;
  label?: string;
  className?: string;
};

export default function RestorePublishedFromRevisionButton({
  mode,
  articleId,
  checkboxName = "articleIds",
  label,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] =
    useState<RestorePublishedActionResult | null>(null);

  const buttonLabel =
    label ??
    (mode === "bulk" ? "선택 기사 다시 공개" : "수정 없이 다시 공개");
  const buttonClass =
    className ??
    (mode === "bulk"
      ? "rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      : "rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50");

  function collectIds(): string[] {
    if (mode === "single" && articleId) {
      return [articleId];
    }
    const checked = document.querySelectorAll<HTMLInputElement>(
      `input[name="${checkboxName}"]:checked`
    );
    return Array.from(checked)
      .map((el) => el.value.trim())
      .filter(Boolean);
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (pending) return;

    const ids = collectIds();
    if (ids.length === 0) {
      window.alert(
        mode === "bulk"
          ? "다시 공개할 기사를 선택해 주세요."
          : "기사 ID가 없습니다."
      );
      return;
    }

    if (!window.confirm(restorePublishedConfirmMessage(ids.length))) {
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("articleIdsCsv", ids.join(","));
      for (const id of ids) {
        fd.append("articleIds", id);
      }
      if (mode === "single" && articleId) {
        fd.set("articleId", articleId);
      }

      const result = await restorePublishedFromRevisionByIdsAction(fd);
      setLastResult(result);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={buttonClass}
      >
        {pending ? "복구 중…" : buttonLabel}
      </button>

      {lastResult ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p>
            성공 {lastResult.successCount}건 · 제외 {lastResult.skippedCount}건
            · 실패 {lastResult.failedCount}건
          </p>
          {lastResult.error ? (
            <p className="mt-1 text-amber-900">{lastResult.error}</p>
          ) : null}
          {lastResult.items.filter((i) => !i.ok).length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-950">
              {lastResult.items
                .filter((i) => !i.ok)
                .slice(0, 20)
                .map((item) => (
                  <li key={item.articleId}>
                    {item.articleId.slice(0, 8)}… — {item.message}
                  </li>
                ))}
            </ul>
          ) : null}
          {lastResult.items.filter((i) => i.ok && i.koSlug).length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs">
              {lastResult.items
                .filter((i) => i.ok && i.koSlug)
                .slice(0, 20)
                .map((item) => (
                  <li key={`ok-${item.articleId}`}>
                    <Link
                      href={`/ko/article/${item.koSlug}`}
                      className="underline"
                      target="_blank"
                    >
                      공개 링크 ({item.articleId.slice(0, 8)}…)
                    </Link>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
