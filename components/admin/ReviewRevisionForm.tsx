"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestRevision } from "@/app/admin/(app)/review/[id]/actions";

type Props = {
  articleId: string;
};

export default function ReviewRevisionForm({ articleId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-6 rounded-2xl border bg-gray-50 p-4 sm:mt-8 sm:p-5">
      <h4 className="text-base font-semibold">수정 대기로 보내기</h4>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        상태만 변경합니다. 제목·요약·본문·썸네일은 그대로 보존되며 OpenAI는
        호출되지 않습니다. AI 재작성은「수정 대기」목록의「AI로 수정」에서
        실행하세요.
      </p>

      {error ? (
        <div className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {success}
        </div>
      ) : null}

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setSuccess(null);
          const form = e.currentTarget;
          const fd = new FormData(form);
          const feedbackType = String(fd.get("feedbackType") || "other");
          const feedbackNote = String(fd.get("feedbackNote") || "");

          startTransition(async () => {
            try {
              await requestRevision(articleId, feedbackType, feedbackNote);
              setSuccess(
                "수정 대기로 이동했습니다. 기사 내용은 변경되지 않았습니다."
              );
              router.refresh();
              router.push("/admin/revision");
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
        }}
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            수정 유형
          </label>
          <select
            name="feedbackType"
            defaultValue="image_mismatch"
            className="w-full rounded-xl border px-4 py-3 text-sm"
            disabled={isPending}
          >
            <option value="title_mismatch">제목 불일치</option>
            <option value="image_mismatch">이미지 불일치</option>
            <option value="content_mismatch">내용 불일치</option>
            <option value="bad_translation">번역 이상</option>
            <option value="wrong_link">링크 문제</option>
            <option value="wrong_category">카테고리 오류</option>
            <option value="low_quality_article">기사 품질 낮음</option>
            <option value="duplicate_issue">중복 이슈 확인 필요</option>
            <option value="other">기타</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            수정 메모
          </label>
          <textarea
            name="feedbackNote"
            rows={5}
            className="w-full rounded-xl border px-4 py-3 text-sm"
            required
            disabled={isPending}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 disabled:opacity-50 sm:w-auto"
        >
          {isPending ? "수정 대기로 이동 중…" : "수정 대기로 보내기"}
        </button>
      </form>
    </div>
  );
}
