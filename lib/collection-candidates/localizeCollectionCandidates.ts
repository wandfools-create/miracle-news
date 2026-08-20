import "server-only";

import { chatCompletionJson } from "@/lib/openai/chatCompletionJson";
import { checkOpenAiEnv } from "@/lib/openai/env";
import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/serviceRole";

const MAX_LOCALIZE_BATCH = 20;

const SYSTEM_PROMPT =
  "You are a news headline translator. Output JSON only: " +
  '{"items":[{"id":string,"title_ko":string,"summary_ko":string}]}.\n' +
  "Rules:\n" +
  "- Translate each RSS title into natural Korean. Keep names and numbers.\n" +
  "- Translate RSS summary into 1–2 Korean sentences. If summary is empty, leave summary_ko empty string.\n" +
  "- Do not add facts, speculation, or rewrite as a new article.\n" +
  "- Do not extract article body. Do not invent images.\n" +
  "- Return one object per input id. Do not drop or invent ids.";

export type LocalizeSelectedCandidatesResult =
  | {
      ok: true;
      queued: number;
      updated: number;
      skippedAlreadyKo: number;
      openaiCalls: number;
    }
  | { ok: false; error: string; step: string; openaiCalls: number };

type TranslateItem = {
  id: string;
  title_ko?: unknown;
  summary_ko?: unknown;
};

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Translate only explicitly selected candidates. No OpenAI if none need Korean. */
export async function localizeSelectedCollectionCandidates(
  candidateIds: string[]
): Promise<LocalizeSelectedCandidatesResult> {
  const ids = uniqueIds(candidateIds).slice(0, MAX_LOCALIZE_BATCH);
  if (ids.length === 0) {
    return {
      ok: false,
      error: "한글화할 후보를 선택해 주세요.",
      step: "validation",
      openaiCalls: 0,
    };
  }

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error, step: envCheck.step, openaiCalls: 0 };
  }

  const { client } = createServiceRoleSupabaseClient();

  const { data, error } = await client
    .from("collection_candidates")
    .select("id, rss_title, rss_summary, rss_title_ko")
    .in("id", ids);

  if (error) {
    return { ok: false, error: error.message, step: "fetch_candidates", openaiCalls: 0 };
  }

  const rows = data ?? [];
  const alreadyKo = rows.filter((row) =>
    Boolean((row as { rss_title_ko?: string | null }).rss_title_ko?.trim())
  );
  const needsKo = rows.filter(
    (row) => !(row as { rss_title_ko?: string | null }).rss_title_ko?.trim()
  );

  if (needsKo.length === 0) {
    console.info("[collection-candidates] localize skipped", {
      openaiCalls: 0,
      queued: 0,
      skippedAlreadyKo: alreadyKo.length,
      reason: "selected candidates already have rss_title_ko",
    });
    return {
      ok: true,
      queued: 0,
      updated: 0,
      skippedAlreadyKo: alreadyKo.length,
      openaiCalls: 0,
    };
  }

  const openAi = checkOpenAiEnv();
  if (!openAi.ok) {
    return { ok: false, error: openAi.error, step: openAi.step, openaiCalls: 0 };
  }

  const payload = needsKo.map((row) => ({
    id: String((row as { id: string }).id),
    title: String((row as { rss_title: string }).rss_title ?? "").trim(),
    summary: String((row as { rss_summary?: string | null }).rss_summary ?? "").trim(),
  }));

  console.info("[collection-candidates] localize start", {
    openaiCalls: 1,
    queued: payload.length,
    skippedAlreadyKo: alreadyKo.length,
  });

  const completion = await chatCompletionJson<{ items?: unknown }>({
    step: "collection_candidates_localize",
    system: SYSTEM_PROMPT,
    user: JSON.stringify({ items: payload }),
    temperature: 0.2,
  });

  if (!completion.ok) {
    console.warn("[collection-candidates] localize OpenAI failed", {
      openaiCalls: 1,
      queued: payload.length,
      error: completion.error,
    });
    return {
      ok: false,
      error: completion.error,
      step: completion.step,
      openaiCalls: 1,
    };
  }

  const rawItems = completion.data.items;
  const items: TranslateItem[] = Array.isArray(rawItems)
    ? (rawItems as TranslateItem[])
    : [];

  const byId = new Map<string, { titleKo: string; summaryKo: string }>();
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const titleKo =
      typeof item.title_ko === "string" ? item.title_ko.trim() : "";
    const summaryKo =
      typeof item.summary_ko === "string" ? item.summary_ko.trim() : "";
    if (!id || !titleKo) continue;
    byId.set(id, { titleKo, summaryKo });
  }

  let updated = 0;
  for (const row of payload) {
    const translated = byId.get(row.id);
    if (!translated) continue;

    const { error: updateError } = await client
      .from("collection_candidates")
      .update({
        rss_title_ko: translated.titleKo,
        rss_summary_ko: translated.summaryKo || null,
      })
      .eq("id", row.id);

    if (updateError) {
      console.warn("[collection-candidates] localize update failed", {
        id: row.id,
        error: updateError.message,
      });
      continue;
    }
    updated += 1;
  }

  console.info("[collection-candidates] localize done", {
    openaiCalls: 1,
    queued: payload.length,
    updated,
    skippedAlreadyKo: alreadyKo.length,
  });

  try {
    await client.from("collection_logs").insert({
      source: "RSS candidate localize",
      checked_count: payload.length,
      saved_count: updated,
      duplicate_count: alreadyKo.length,
      failed_count: payload.length - updated,
      status: updated > 0 ? "success" : "failed",
      note: `candidate localize selected · openai_calls=1 queued=${payload.length} updated=${updated} skipped_already_ko=${alreadyKo.length}`,
    });
  } catch (err) {
    console.warn("[collection-candidates] localize collection_logs failed", err);
  }

  return {
    ok: true,
    queued: payload.length,
    updated,
    skippedAlreadyKo: alreadyKo.length,
    openaiCalls: 1,
  };
}
