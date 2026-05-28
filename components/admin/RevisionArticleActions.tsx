"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  runAiRevisionForArticle,
  sendBackToReview,
} from "@/app/admin/(app)/revision/actions";

type Props = {
  articleId: string;
  revisionLogId: string | null;
  feedbackType: string | null;
  feedbackNote: string;
  aiReviewStatus: string | null;
  aiReviewNotes: string | null;
  autoRunAi?: boolean;
};

export default function RevisionArticleActions({
  articleId,
  revisionLogId,
  feedbackType,
  feedbackNote,
  aiReviewStatus,
  aiReviewNotes,
  autoRunAi = true,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isAiPending, startAi] = useTransition();
  const [isSendPending, startSend] = useTransition();
  const autoStarted = useRef(false);

  const shouldAutoRun =
    autoRunAi &&
    aiReviewStatus === "pending" &&
    !autoStarted.current &&
    feedbackNote.trim().length > 0;

  useEffect(() => {
    if (!shouldAutoRun) return;
    autoStarted.current = true;
    startAi(async () => {
      const res = await runAiRevisionForArticle(
        articleId,
        revisionLogId,
        feedbackType || "other",
        feedbackNote
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(res.message);
      router.refresh();
    });
  }, [
    shouldAutoRun,
    articleId,
    revisionLogId,
    feedbackType,
    feedbackNote,
    router,
  ]);

  function handleRunAi() {
    setError(null);
    setMessage(null);
    startAi(async () => {
      const res = await runAiRevisionForArticle(
        articleId,
        revisionLogId,
        feedbackType || "other",
        feedbackNote
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(res.message);
      router.refresh();
    });
  }

  function handleSendBack() {
    setError(null);
    startSend(async () => {
      try {
        await sendBackToReview(
          articleId,
          revisionLogId,
          feedbackType,
          feedbackNote
        );
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        setError(text);
      }
    });
  }

  const busy = isAiPending || isSendPending;

  return (
    <div className="mt-4 space-y-3">
      {aiReviewNotes ? (
        <p className="whitespace-pre-wrap rounded-xl border bg-gray-50 p-3 text-xs leading-5 text-gray-600">
          AI 메모: {aiReviewNotes}
        </p>
      ) : null}

      {error ? (
        <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link
          href={`/admin/review/${articleId}`}
          className="text-sm font-medium text-blue-600 underline"
        >
          기사 상세 다시 보기
        </Link>

        <button
          type="button"
          onClick={handleRunAi}
          disabled={busy}
          className="w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-50 sm:w-auto"
        >
          {isAiPending ? "OpenAI 수정 중…" : "AI 수정 다시 실행"}
        </button>

        <button
          type="button"
          onClick={handleSendBack}
          disabled={busy}
          className="w-full rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 sm:w-auto"
        >
          {isSendPending
            ? "AI 검토 후 재검토로 이동…"
            : "재검토로 보내기 (AI 검토 포함)"}
        </button>
      </div>
    </div>
  );
}
