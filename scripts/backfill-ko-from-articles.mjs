import { createClient } from "@supabase/supabase-js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing");
}
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

async function translateArticle(article) {
  const body = {
    model: "gpt-5.4",
    instructions:
      "You are a Korean newsroom localization editor. Convert the English news metadata into natural Korean. Do not invent facts. Return one Korean headline and one Korean summary in 2 sentences.",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `SOURCE: ${article.source}\n` +
              `TITLE: ${article.title_original || ""}\n` +
              `URL: ${article.original_url || ""}\n` +
              `PUBLISHED_AT: ${article.published_at || ""}\n` +
              `EXCERPT: ${article.summary_original || ""}\n` +
              `CONTENT: ${article.body_original || article.summary_original || ""}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "article_localization",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title_ko: { type: "string" },
            summary_ko: { type: "string" },
          },
          required: ["title_ko", "summary_ko"],
          additionalProperties: false,
        },
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const text = json?.output?.[0]?.content?.[0]?.text;

  if (!text) {
    throw new Error("OpenAI response text is missing");
  }

  const parsed = JSON.parse(text);

  return {
    title_ko: parsed.title_ko?.trim() || null,
    summary_ko: parsed.summary_ko?.trim() || null,
  };
}

async function upsertKoLocalization(article, translated) {
  const { data: existingKo, error: findError } = await supabase
    .from("article_localizations")
    .select("id")
    .eq("article_id", article.id)
    .eq("locale", "ko")
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  const koTitle =
    translated.title_ko ||
    article.title_ko ||
    article.title_translated ||
    article.title_original;

  const koSummary =
    translated.summary_ko ||
    article.summary_ko ||
    article.summary_translated ||
    article.summary_original ||
    null;

  const koBody =
    article.body_translated ||
    article.body_original ||
    null;

  const payload = {
    article_id: article.id,
    locale: "ko",
    title: koTitle,
    summary: koSummary,
    body: koBody,
    slug: `${slugify(koTitle, "article")}-${String(article.id).slice(0, 8)}`,
    meta_description: koSummary,
  };

  if (existingKo?.id) {
    const { error } = await supabase
      .from("article_localizations")
      .update(payload)
      .eq("id", existingKo.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("article_localizations")
      .insert(payload);

    if (error) throw error;
  }
}

async function main() {
  const { data: articles, error } = await supabase
    .from("articles")
    .select(`
      id,
      source,
      original_url,
      title_original,
      summary_original,
      body_original,
      title_translated,
      summary_translated,
      body_translated,
      title_ko,
      summary_ko,
      status,
      review_status,
      is_published,
      published_at
    `)
    .or("title_ko.is.null,title_ko.eq.")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  const list = articles || [];
  console.log(`Found ${list.length} articles to backfill`);

  for (const article of list) {
    try {
      console.log(`Translating: ${article.id} / ${article.title_original}`);

      const translated = await translateArticle(article);

      const { error: updateError } = await supabase
        .from("articles")
        .update({
          title_ko: translated.title_ko,
          summary_ko: translated.summary_ko,
          title_translated:
            translated.title_ko || article.title_translated || null,
          summary_translated:
            translated.summary_ko || article.summary_translated || null,
        })
        .eq("id", article.id);

      if (updateError) {
        throw updateError;
      }

      if (article.is_published === true && article.status === "published") {
        await upsertKoLocalization(article, translated);
      }

      console.log(`Done: ${article.id}`);
    } catch (err) {
      console.error(`Failed: ${article.id}`, err);
    }
  }

  console.log("Backfill finished");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});