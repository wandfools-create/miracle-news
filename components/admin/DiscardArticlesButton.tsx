"use client";

import { useRouter } from "next/navigation";
import { useTransition, type MouseEvent } from "react";

import { discardArticlesByIdsAction } from "@/app/admin/(app)/discard/actions";
import { discardConfirmMessage } from "@/lib/admin/discardArticles";

type DiscardFrom = "on_hold" | "revision" | "rejected";

type Props = {
  /** on_hold | revision | rejected */
  from: DiscardFrom;
  /** Checkbox name to collect (default articleIds). */
  checkboxName?: string;
  /** Optional single article id (individual discard). */
  articleId?: string;
  mode: "single" | "bulk";
  label?: string;
  className?: string;
};

function returnPath(from: DiscardFrom): string {
  if (from === "revision") return "/admin/revision";
  if (from === "rejected") return "/admin/rejected";
  return "/admin/on-hold";
}

/**
 * Collects article IDs explicitly (does not rely on form-associated external checkboxes),
 * confirms once, then calls service-role discard action and refreshes the list.
 */
export default function DiscardArticlesButton({
  from,
  checkboxName = "articleIds",
  articleId,
  mode,
  label,
  className,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const buttonLabel =
    label ?? (mode === "bulk" ? "선택 기사 폐기" : "🗑 폐기");
  const buttonClass =
    className ??
    (mode === "bulk"
      ? "rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
      : "rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50");

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
    const ids = collectIds();
    if (ids.length === 0) {
      window.alert(
        mode === "bulk"
          ? "폐기할 기사를 선택해 주세요."
          : "기사 ID가 없습니다."
      );
      return;
    }
    if (!window.confirm(discardConfirmMessage(ids.length))) {
      return;
    }

    const scrollY = window.scrollY;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("from", from);
      fd.set("redirect", "0");
      fd.set("articleIdsCsv", ids.join(","));
      for (const id of ids) {
        fd.append("articleIds", id);
      }

      const result = await discardArticlesByIdsAction(fd);
      if (!result) {
        router.refresh();
        return;
      }

      const params = new URLSearchParams();
      params.set("discarded", String(result.discardedCount));
      params.set("skipped", String(result.skippedCount));
      params.set("failed", String(result.failedCount));
      if (!result.ok || result.discardedCount === 0) {
        params.set(
          "discardError",
          result.error || "폐기된 기사 0건 — DB가 변경되지 않았습니다."
        );
      } else if (result.error) {
        params.set("discardError", result.error);
      }

      router.replace(`${returnPath(from)}?${params.toString()}`);
      router.refresh();
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className={buttonClass}
    >
      {pending ? "폐기 중…" : buttonLabel}
    </button>
  );
}
