import "server-only";

import { chatCompletionJson } from "@/lib/openai/chatCompletionJson";
import {
  checkOpenAiEnv,
  getOpenAiCandidateModel,
} from "@/lib/openai/env";
import {
  WIRE_LOCALIZE_BATCH_SIZE,
  WIRE_LOCALIZE_MAX_PER_COLLECT,
} from "@/lib/news-wire/localizeWireTitlesLogic";
import {
  runWireLocalizeBatch,
  type WireLocalizeBatchResult,
} from "@/lib/news-wire/runWireLocalizeBatch";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

export {
  WIRE_LOCALIZE_BATCH_SIZE,
  WIRE_LOCALIZE_MAX_PER_COLLECT,
  needsLocalization,
  selectUnreadyWireLocalizeBatch,
  filterStillNeedingLocalization,
  buildWireTitlePatchesFromOpenAi,
} from "@/lib/news-wire/localizeWireTitlesLogic";

export type LocalizeWireTitlesResult = WireLocalizeBatchResult;

/**
 * Title-only KO/EN localization for public News Wire.
 * Queries wire_titles_ready_at IS NULL so completed recent rows cannot
 * starve older backlog. Max 40 per call. Idempotent across retries.
 */
export async function localizeWireCandidateTitles(options?: {
  limit?: number;
  candidateIds?: string[];
}): Promise<LocalizeWireTitlesResult> {
  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return {
      ok: false,
      error: envCheck.error,
      step: envCheck.step,
      openaiCalls: 0,
      schemaReady: false,
    };
  }

  const { client } = createServiceRoleSupabaseClient();
  return runWireLocalizeBatch({
    client,
    chatCompletionJson,
    getModel: getOpenAiCandidateModel,
    checkOpenAiEnv: () => {
      const r = checkOpenAiEnv();
      if (!r.ok) return { ok: false, error: r.error, step: r.step };
      return { ok: true };
    },
    limit: options?.limit,
    candidateIds: options?.candidateIds,
  });
}
