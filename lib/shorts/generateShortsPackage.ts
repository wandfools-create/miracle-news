import "server-only";

import { chatCompletionJson, formatOpenAiFailureForUi } from "@/lib/openai/chatCompletionJson";
import { attachServerBuiltSources } from "@/lib/shorts/buildShortsSources";
import { parseShortsProductionPackageJson } from "@/lib/shorts/parseShortsPackageJson";
import { generateStubShortsPackage } from "@/lib/shorts/generateStubShortsPackage";
import { buildShortsPackagePrompt } from "@/lib/shorts/shortsPackagePrompt";
import {
  isShortsOpenAiEnabled,
  resolveShortsOpenAiModel,
} from "@/lib/shorts/shortsPackageEnv";
import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";
import type { ShortsPublishedArticleRow } from "@/lib/shorts/fetchPublishedArticlesForShorts";
import type {
  ShortsGenerationMode,
  ShortsProductionPackageContent,
} from "@/lib/shorts/shortsPackageTypes";

export type GenerateShortsPackageResult =
  | {
      ok: true;
      package: ShortsProductionPackageContent;
      generationMode: ShortsGenerationMode;
    }
  | { ok: false; error: string; step: string };

export async function generateShortsProductionPackage(input: {
  desk: ShortsDesk;
  editDate: string;
  articles: ShortsPublishedArticleRow[];
}): Promise<GenerateShortsPackageResult> {
  if (!isShortsOpenAiEnabled()) {
    return {
      ok: true,
      package: generateStubShortsPackage(input),
      generationMode: "stub",
    };
  }

  const { system, user } = buildShortsPackagePrompt(input);
  const completion = await chatCompletionJson<Record<string, unknown>>({
    step: "shorts_production_package",
    system,
    user,
    temperature: 0.35,
    model: resolveShortsOpenAiModel(),
  });

  if (!completion.ok) {
    return {
      ok: false,
      error: formatOpenAiFailureForUi(completion),
      step: completion.step,
    };
  }

  const parsed = parseShortsProductionPackageJson(completion.data);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `OpenAI JSON 검증 실패: ${parsed.error}`,
      step: "json_validation",
    };
  }

  return {
    ok: true,
    package: attachServerBuiltSources(parsed.package, input.articles),
    generationMode: "openai",
  };
}
