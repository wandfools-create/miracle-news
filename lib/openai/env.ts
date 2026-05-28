import "server-only";

export type OpenAiEnvCheck =
  | { ok: true; model: string; keyPrefix: string }
  | { ok: false; step: "env_check"; error: string; hint: string };

function maskKey(key: string): string {
  if (key.length <= 12) return "(too short)";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
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

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return { ok: true, model, keyPrefix: maskKey(apiKey) };
}
