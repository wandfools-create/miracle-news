"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  runAiRevisionForArticle,
  saveManualRevisionEdit,
  sendBackToReview,
} from "@/app/admin/(app)/revision/actions";
import {
  AI_REVISION_COST_CONFIRM,
  aiRevisionBusyLabel,
  isAiRevisionProcessingStatus,
} from "@/lib/admin/revisionAiPolicy";

type Props = {
  articleId: string;
  revisionLogId: string | null;
  feedbackType: string | null;
  feedbackNote: string;
  aiReviewStatus: string | null;
  aiReviewNotes: string | null;
  initialTitleKo: string;
  initialSummaryKo: string;
  initialBodyKo: string;
};

export default function RevisionArticleActions({
  articleId,
  revisionLogId,
  feedbackType,
  feedbackNote,
  aiReviewStatus,
  aiReviewNotes,
  initialTitleKo,
  initialSummaryKo,
  initialBodyKo,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [titleKo, setTitleKo] = useState(initialTitleKo);
  const [summaryKo, setSummaryKo] = useState(initialSummaryKo);
  const [bodyKo, setBodyKo] = useState(initialBodyKo);
  const [isAiPending, startAi] = useTransition();
  const [isSendPending, startSend] = useTransition();
  const [isManualPending, startManual] = useTransition();

  const serverBusy = isAiRevisionProcessingStatus(aiReviewStatus);
  const busy = isAiPending || isSendPending || isManualPending || serverBusy;

  function handleRunAi() {
    if (busy) return;
    if (!window.confirm(AI_REVISION_COST_CONFIRM)) return;

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

  function handleManualSave() {
    setError(null);
    setMessage(null);
    startManual(async () => {
      const res = await saveManualRevisionEdit(articleId, {
        titleKo,
        summaryKo,
        bodyKo,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(res.message);
      setShowManual(false);
      router.refresh();
    });
  }

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
          onClick={() => setShowManual((v) => !v)}
          disabled={busy}
          className="w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-50 sm:w-auto"
        >
          {showManual ? "직접 수정 닫기" : "직접 수정"}
        </button>

        <button
          type="button"
          onClick={handleRunAi}
          disabled={busy}
          className="w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-50 sm:w-auto"
        >
          {aiRevisionBusyLabel(isAiPending || serverBusy)}
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

      {showManual ? (
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-500">
            OpenAI 없이 제목·요약·본문만 저장합니다.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              제목
            </label>
            <input
              value={titleKo}
              onChange={(e) => setTitleKo(e.target.value)}
              disabled={isManualPending}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              요약
            </label>
            <textarea
              value={summaryKo}
              onChange={(e) => setSummaryKo(e.target.value)}
              rows={3}
              disabled={isManualPending}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              본문
            </label>
            <textarea
              value={bodyKo}
              onChange={(e) => setBodyKo(e.target.value)}
              rows={10}
              disabled={isManualPending}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleManualSave}
            disabled={isManualPending}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isManualPending ? "저장 중…" : "수동 수정 저장"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
