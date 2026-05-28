import "server-only";

import {
  checkSupabaseServiceEnvWithDns,
  createServiceRoleSupabaseClient,
  formatPostgrestError,
  formatSupabaseThrownError,
} from "@/lib/supabase/serviceRole";
import { resolveSubmittedUrl } from "@/lib/from-link/resolveSubmittedUrl";

export type FindExistingArticleByUrlResult =
  | { ok: true; articleId: string | null }
  | { ok: false; error: string };

/**
 * Returns the most recently collected article with the same original_url (any source).
 */
export async function findExistingArticleByOriginalUrl(
  originalUrl: string
): Promise<FindExistingArticleByUrlResult> {
  const resolved = resolveSubmittedUrl(originalUrl);
  if (!resolved.ok) {
    return { ok: true, articleId: null };
  }
  const normalized = resolved.href;

  const envCheck = await checkSupabaseServiceEnvWithDns();
  if (!envCheck.ok) {
    return { ok: false, error: envCheck.error };
  }

  try {
    const { client } = createServiceRoleSupabaseClient();

    const { data, error } = await client
      .from("articles")
      .select("id, original_url, collected_at")
      .eq("original_url", normalized)
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        error: formatPostgrestError("find_by_original_url", error).error,
      };
    }

    if (data?.id) {
      return { ok: true, articleId: data.id as string };
    }

    // Fallback: trailing-slash variant (legacy rows)
    const alt =
      normalized.endsWith("/") ? normalized.slice(0, -1) : `${normalized}/`;

    if (alt !== normalized) {
      const { data: altRow, error: altErr } = await client
        .from("articles")
        .select("id")
        .eq("original_url", alt)
        .order("collected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (altErr) {
        return {
          ok: false,
          error: formatPostgrestError("find_by_original_url_alt", altErr).error,
        };
      }

      if (altRow?.id) {
        return { ok: true, articleId: altRow.id as string };
      }
    }

    return { ok: true, articleId: null };
  } catch (err) {
    return {
      ok: false,
      error: formatSupabaseThrownError(
        "find_by_original_url",
        err,
        envCheck.urlHost
      ).error,
    };
  }
}
