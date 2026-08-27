/** When "1", OpenAI may be used for Shorts package generation. Default: stub only. */
export function isShortsOpenAiEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.SHORTS_AI_OPENAI_ENABLED?.trim() === "1";
}

export function shortsPackageStoreDir(
  env: NodeJS.ProcessEnv = process.env
): string {
  const custom = env.SHORTS_PACKAGE_STORE_DIR?.trim();
  if (custom) return custom;
  return `${process.cwd()}/data/shorts-packages`;
}

const DEFAULT_SHORTS_MODEL = "gpt-4o-mini";

/**
 * OPENAI_SHORTS_MODEL → OPENAI_ARTICLE_MODEL → OPENAI_MODEL → default.
 * Pure helper (testable without server-only).
 */
export function resolveShortsOpenAiModel(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    env.OPENAI_SHORTS_MODEL?.trim() ||
    env.OPENAI_ARTICLE_MODEL?.trim() ||
    env.OPENAI_MODEL?.trim() ||
    DEFAULT_SHORTS_MODEL
  );
}
