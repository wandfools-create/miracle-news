"use client";

import type { MouseEvent } from "react";

import { discardConfirmMessage } from "@/lib/admin/discardArticles";

type CommonProps = {
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Next.js server action bound to this submit button. */
  formAction?: (formData: FormData) => void | Promise<void>;
};

type SingleProps = CommonProps & {
  mode: "single";
};

type BulkProps = CommonProps & {
  mode: "bulk";
  /** Checkbox name used in the bulk form (default articleIds). */
  checkboxName?: string;
};

type Props = SingleProps | BulkProps;

/**
 * Submit button that asks for a single confirm before discard form POST.
 */
export default function DiscardConfirmSubmitButton(props: Props) {
  const label =
    props.label ??
    (props.mode === "bulk" ? "선택 기사 폐기" : "🗑 폐기");
  const className =
    props.className ??
    (props.mode === "bulk"
      ? "rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
      : "rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50");

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (props.disabled) {
      event.preventDefault();
      return;
    }

    let count = 1;
    if (props.mode === "bulk") {
      const name = props.checkboxName ?? "articleIds";
      const form = event.currentTarget.form;
      const scope = form ?? document;
      const checked = scope.querySelectorAll<HTMLInputElement>(
        `input[name="${name}"]:checked`
      );
      count = checked.length;
      if (count === 0) {
        event.preventDefault();
        window.alert("폐기할 기사를 선택해 주세요.");
        return;
      }
    }

    if (!window.confirm(discardConfirmMessage(count))) {
      event.preventDefault();
    }
  }

  return (
    <button
      type="submit"
      disabled={props.disabled}
      formAction={props.formAction}
      onClick={handleClick}
      className={className}
    >
      {label}
    </button>
  );
}
