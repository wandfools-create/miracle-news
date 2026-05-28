"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleText: string;
  pendingText: string;
  variant?: "primary" | "secondary" | "danger";
};

const variantClassMap: Record<NonNullable<Props["variant"]>, string> = {
  primary:
    "bg-black text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "border border-gray-300 text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "border border-red-300 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60",
};

export default function ActionSubmitButton({
  idleText,
  pendingText,
  variant = "primary",
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${variantClassMap[variant]}`}
    >
      {pending ? pendingText : idleText}
    </button>
  );
}