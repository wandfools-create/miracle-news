import "server-only";

import { chatCompletionJson, formatOpenAiFailureForUi } from "@/lib/openai/chatCompletionJson";
import { checkOpenAiEnv } from "@/lib/openai/env";
import { EDITORIAL_REVIEW_SYSTEM_PROMPT } from "@/lib/articles/ai/editorPrompt";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export type RunEditorialReviewInput = {
  articleId: string;
  feedbackType?: string | null;
  feedbackNote?: string | null;
};

export type RunEditorialReviewResult =
  | {
      ok: true;
      status: "pass" | "warning" | "fail";
      notesKo: string;
    }
  | {
      ok: false;
      step: string;
      error: string;
      uiMessage: string;
      hint?: string;
    };

export async function runEditorialReview(
  input: RunEditorialReviewInput
): Promise<RunEditorialReviewResult> {
  const openAiEnv = checkOpenAiEnv();
  if (!openAiEnv.ok) {
    return {
      ok: false,
      step: "openai_env_check",
      error: openAiEnv.error,
      uiMessage: `[openai_env_check] ${openAiEnv.error}\n${openAiEnv.hint}`,
      hint: openAiEnv.hint,
    };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      ok: false,
      step: envCheck.step,
      error: envCheck.error,
      uiMessage: `[${envCheck.step}] ${envCheck.error}`,
      hint: envCheck.hint,
    };
  }

  const { client: supabase } = createServiceRoleSupabaseClient();
  const { data: article, error } = await supabase
    .from("articles")
    .select(
      `
      id,
      title_ko,
      title_translated,
      summary_ko,
      summary_translated,
      body_translated,
      ai_review_notes,
      revision_request
    `
    )
    .eq("id", input.articleId)
    .single();

  if (error || !article) {
    const msg = error?.message || "기사 없음";
    return {
      ok: false,
      step: "load_article",
      error: msg,
      uiMessage: `[load_article] ${msg}`,
    };
  }

  const ai = await chatCompletionJson<{
    status?: string;
    notes_ko?: string;
  }>({
    step: "editorial_review_chat",
    system: EDITORIAL_REVIEW_SYSTEM_PROMPT,
    user: JSON.stringify({
      feedback_type: input.feedbackType ?? null,
      feedback_note: input.feedbackNote ?? article.revision_request,
      title_ko: article.title_ko || article.title_translated,
      summary_ko: article.summary_ko || article.summary_translated,
      body_ko: article.body_translated,
      prior_ai_notes: article.ai_review_notes,
    }),
    temperature: 0.2,
  });

  if (!ai.ok) {
    return {
      ok: false,
      step: ai.step,
      error: ai.error,
      hint: ai.hint,
      uiMessage: formatOpenAiFailureForUi(ai),
    };
  }

  const statusRaw = String(ai.data.status || "").toLowerCase();
  const status: "pass" | "warning" | "fail" =
    statusRaw === "pass" || statusRaw === "warning" || statusRaw === "fail"
      ? statusRaw
      : "warning";

  const notesKo =
    typeof ai.data.notes_ko === "string" && ai.data.notes_ko.trim()
      ? ai.data.notes_ko.trim()
      : "AI 검토 메모 없음";

  const { error: updateError } = await supabase
    .from("articles")
    .update({
      ai_review_status: status,
      ai_review_notes: notesKo,
    })
    .eq("id", input.articleId);

  if (updateError) {
    return {
      ok: false,
      step: "update_ai_review",
      error: updateError.message,
      uiMessage: `[update_ai_review] ${updateError.message}`,
    };
  }

  return { ok: true, status, notesKo };
}
