import "server-only";

import { checkOpenAiEnv } from "./env";

const DEFAULT_TIMEOUT_MS = 120_000;

export type ChatCompletionJsonFailure = {
  ok: false;
  step: string;
  error: string;
  hint?: string;
  httpStatus?: number;
  responseBody?: string;
};

export type ChatCompletionJsonSuccess<T> = {
  ok: true;
  data: T;
};

export type ChatCompletionJsonResult<T> =
  | ChatCompletionJsonSuccess<T>
  | ChatCompletionJsonFailure;

export async function chatCompletionJson<T extends Record<string, unknown>>(
  input: {
    step: string;
    system: string;
    user: string;
    temperature?: number;
    timeoutMs?: number;
    /** Override model. Default: OPENAI_ARTICLE_MODEL (article / from-link). */
    model?: string;
  }
): Promise<ChatCompletionJsonResult<T>> {
  const env = checkOpenAiEnv();
  if (!env.ok) {
    console.error(`[openai/${input.step}] env check failed`, env);
    return {
      ok: false,
      step: "openai_env_check",
      error: env.error,
      hint: env.hint,
    };
  }

  const model = input.model?.trim() || env.model;

  const payload = {
    model,
    temperature: input.temperature ?? 0.35,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: input.system },
      { role: "user" as const, content: input.user },
    ],
  };

  console.info(`[openai/${input.step}] request`, { model });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await res.text().catch(() => "");

    if (!res.ok) {
      console.error(`[openai/${input.step}] HTTP ${res.status}`, rawText.slice(0, 800));
      return {
        ok: false,
        step: input.step,
        error: `OpenAI API 오류 (HTTP ${res.status})`,
        hint: rawText.slice(0, 500) || "응답 본문이 비어 있습니다.",
        httpStatus: res.status,
        responseBody: rawText.slice(0, 800),
      };
    }

    let envelope: {
      choices?: Array<{ message?: { content?: string } }>;
    };
    try {
      envelope = JSON.parse(rawText) as typeof envelope;
    } catch {
      return {
        ok: false,
        step: input.step,
        error: "OpenAI 응답 JSON 파싱에 실패했습니다.",
        hint: rawText.slice(0, 300),
      };
    }

    const content = envelope.choices?.[0]?.message?.content;
    if (!content?.trim()) {
      return {
        ok: false,
        step: input.step,
        error: "OpenAI가 비어 있는 응답을 반환했습니다.",
      };
    }

    try {
      const data = JSON.parse(content) as T;
      return { ok: true, data };
    } catch {
      return {
        ok: false,
        step: input.step,
        error: "OpenAI 메시지 content JSON 파싱에 실패했습니다.",
        hint: content.slice(0, 400),
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const aborted =
      err instanceof Error &&
      (err.name === "AbortError" || message.includes("aborted"));

    console.error(`[openai/${input.step}] fetch threw`, err);

    return {
      ok: false,
      step: input.step,
      error: aborted
        ? `OpenAI 요청 시간 초과 (${(input.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000}초)`
        : message,
      hint: aborted
        ? "네트워크가 느리거나 모델 응답이 지연되었습니다. 잠시 후 다시 시도하세요."
        : "서버 콘솔에 [openai/…] 로그를 확인하세요.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function formatOpenAiFailureForUi(
  failure: ChatCompletionJsonFailure
): string {
  const lines = [
    `[${failure.step}] ${failure.error}`,
    failure.hint ? `상세: ${failure.hint}` : null,
    failure.httpStatus ? `HTTP ${failure.httpStatus}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
