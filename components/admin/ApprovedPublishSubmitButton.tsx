"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label?: string;
  pendingLabel?: string;
  className?: string;
};

export default function ApprovedPublishSubmitButton({
  label = "공개",
  pendingLabel = "처리 중…",
  className = "rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
