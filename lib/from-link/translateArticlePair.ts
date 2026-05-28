import "server-only";

import { stripUrlsFromArticleText } from "./sanitizeArticleText";
import { chatCompletionJson } from "@/lib/openai/chatCompletionJson";
import { checkOpenAiEnv } from "@/lib/openai/env";

export type TranslateArticlePairInput = {
  direction: "ko_to_en" | "en_to_ko";
  title: string;
  summary: string;
  body: string;
};

export type TranslateArticlePairResult =
  | {
      ok: true;
      title: string;
      summary: string;
      body: string;
    }
  | { ok: false; error: string };

const TRANSLATION_SYSTEM_PROMPT =
  'You are a professional news translator. Output JSON only: {"title":string,"summary":string,"body":string}.\n' +
  "Rules:\n" +
  "- Translate faithfully; do not add or remove facts.\n" +
  "- No URLs, markdown headings, or bullet lists in body.\n" +
  "- summary: 1–2 sentences, max ~220 characters in the target language.\n" +
  "- body: same paragraph count and structure as the source (plain text, blank lines between paragraphs).";

export async function translateArticlePair(
  input: TranslateArticlePairInput
): Promise<TranslateArticlePairResult> {
  const env = checkOpenAiEnv();
  if (!env.ok) {
    return { ok: false, error: env.error };
  }

  const title = input.title.trim();
  const summary = input.summary.trim();
  const body = input.body.trim();

  if (!title || !summary || !body) {
    return { ok: false, error: "번역할 제목·요약·본문이 비어 있습니다." };
  }

  const targetLanguage = input.direction === "ko_to_en" ? "English" : "Korean";

  const completion = await chatCompletionJson<Record<string, unknown>>({
    step: `from_link_translate_${input.direction}`,
    system: TRANSLATION_SYSTEM_PROMPT,
    user: JSON.stringify({
      target_language: targetLanguage,
      title,
      summary,
      body: body.slice(0, 14_000),
    }),
    temperature: 0.3,
  });

  if (!completion.ok) {
    return {
      ok: false,
      error: completion.error || "번역 API 호출에 실패했습니다.",
    };
  }

  const o = completion.data;
  const outTitle = stripUrlsFromArticleText(
    typeof o.title === "string" ? o.title : ""
  );
  const outSummary = stripUrlsFromArticleText(
    typeof o.summary === "string" ? o.summary : ""
  );
  const outBody = stripUrlsFromArticleText(
    typeof o.body === "string" ? o.body : ""
  );

  if (!outTitle || !outSummary || !outBody) {
    return { ok: false, error: "번역 결과에 제목·요약·본문이 모두 포함되지 않았습니다." };
  }

  return {
    ok: true,
    title: outTitle,
    summary: outSummary,
    body: outBody,
  };
}
