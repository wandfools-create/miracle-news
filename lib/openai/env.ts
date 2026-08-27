import "server-only";

export type OpenAiEnvCheck =
  | { ok: true; model: string; keyPrefix: string }
  | { ok: false; step: "env_check"; error: string; hint: string };

const DEFAULT_ARTICLE_MODEL = "gpt-4o-mini";
const DEFAULT_CANDIDATE_MODEL = "gpt-5.4-nano";

function maskKey(key: string): string {
  if (key.length <= 12) return "(too short)";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

/** Low-cost model for RSS candidate title/summary localization only. */
export function getOpenAiCandidateModel(): string {
  return process.env.OPENAI_CANDIDATE_MODEL?.trim() || DEFAULT_CANDIDATE_MODEL;
}

/**
 * High-quality model for article creation / from-link enrich.
 * Prefer OPENAI_ARTICLE_MODEL; fall back to legacy OPENAI_MODEL.
 */
export function getOpenAiArticleModel(): string {
  return (
    process.env.OPENAI_ARTICLE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_ARTICLE_MODEL
  );
}

/**
 * Model for Shorts production packages.
 * OPENAI_SHORTS_MODEL → OPENAI_ARTICLE_MODEL → OPENAI_MODEL → default.
 * Does not change article/candidate model selection.
 */
export function getOpenAiShortsModel(): string {
  return (
    process.env.OPENAI_SHORTS_MODEL?.trim() ||
    process.env.OPENAI_ARTICLE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_ARTICLE_MODEL
  );
}

export function checkOpenAiEnv(): OpenAiEnvCheck {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      step: "env_check",
      error: "OPENAI_API_KEY가 설정되지 않았습니다.",
      hint:
        ".env.local에 OPENAI_API_KEY를 추가한 뒤 개발 서버(npm run dev)를 재시작하세요.",
    };
  }

  if (!apiKey.startsWith("sk-")) {
    return {
      ok: false,
      step: "env_check",
      error: "OPENAI_API_KEY 형식이 올바르지 않습니다.",
      hint: "OpenAI 대시보드에서 발급한 sk- 로 시작하는 키인지 확인하세요.",
    };
  }

  return {
    ok: true,
    model: getOpenAiArticleModel(),
    keyPrefix: maskKey(apiKey),
  };
}
