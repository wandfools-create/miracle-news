import { supabase } from "@/lib/supabase";
import type { ArticleLocale } from "@/lib/article/formatPublishedDate";

export type CrossLocaleArticleRedirect = {
  path: string;
};

/**
 * Read-only: recover /ko/article/{EN slug} and /en/article/{KO slug}.
 * Returns canonical path for the requested locale when the slug belongs to the other localization.
 */
export async function resolveCrossLocaleArticleRedirect(
  requestedLocale: ArticleLocale,
  slug: string
): Promise<CrossLocaleArticleRedirect | null> {
  const decoded = decodeURIComponent(slug).trim();
  if (!decoded) return null;

  const { data: bySlug, error } = await supabase
    .from("article_localizations")
    .select("article_id, locale, slug")
    .eq("slug", decoded);

  if (error || !bySlug?.length) return null;

  const foreign = bySlug.find((row) => row.locale !== requestedLocale);
  if (!foreign) return null;

  const { data: targetLoc, error: targetError } = await supabase
    .from("article_localizations")
    .select("slug")
    .eq("article_id", foreign.article_id)
    .eq("locale", requestedLocale)
    .maybeSingle();

  if (targetError || !targetLoc?.slug?.trim()) return null;

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .select("id")
    .eq("id", foreign.article_id)
    .eq("review_status", "approved")
    .eq("is_published", true)
    .eq("status", "published")
    .maybeSingle();

  if (articleError || !article) return null;

  const targetSlug = encodeURIComponent(targetLoc.slug.trim());
  if (targetSlug === decoded) return null;

  return { path: `/${requestedLocale}/article/${targetSlug}` };
}
