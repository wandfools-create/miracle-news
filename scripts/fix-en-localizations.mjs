import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function slugify(value, fallback) {
  const base = (value || fallback || "article")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || fallback;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("article_localizations")
    .select(`
      id,
      article_id,
      locale,
      title,
      summary,
      body,
      articles!inner (
        id,
        title_original,
        summary_original,
        body_original
      )
    `)
    .eq("locale", "en");

  if (error) {
    throw error;
  }

  const list = rows || [];
  console.log(`Found ${list.length} English localization rows`);

  for (const row of list) {
    const article = Array.isArray(row.articles) ? row.articles[0] : row.articles;

    if (!article) {
      console.log(`Skip ${row.id}: article missing`);
      continue;
    }

    const enTitle = article.title_original || "article";
    const enSummary = article.summary_original || null;
    const enBody = article.body_original || null;
    const enSlug = `${slugify(enTitle, "article")}-${String(row.article_id).slice(0, 8)}`;

    const { error: updateError } = await supabase
      .from("article_localizations")
      .update({
        title: enTitle,
        summary: enSummary,
        body: enBody,
        slug: enSlug,
        meta_description: enSummary,
      })
      .eq("id", row.id);

    if (updateError) {
      console.error(`Failed: ${row.id}`, updateError.message);
      continue;
    }

    console.log(`Fixed: ${row.id}`);
  }

  console.log("English localization repair finished");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});