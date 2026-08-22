import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeSlug(value: string, fallback: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || fallback;
}

function inferSourceCountry(source: string) {
  const koreanSources = ["조선일보", "중앙일보", "TV조선", "인사이트"];
  return koreanSources.includes(source) ? "KR" : "US";
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "ingest route ready",
  });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("x-ingest-token");
  const expectedToken = process.env.INGEST_API_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "missing supabase env" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const body = await request.json();

  const source = String(body.source || "").trim();
  const originalUrl = String(body.original_url || "").trim();
  const titleOriginal = String(body.title_original || "").trim();

  if (!source || !originalUrl || !titleOriginal) {
    return NextResponse.json(
      {
        ok: false,
        error: "source, original_url, title_original are required",
      },
      { status: 400 }
    );
  }

  const sourceCountry =
    String(body.source_country || "").trim() || inferSourceCountry(source);
  const languageOriginal =
    String(body.language_original || "").trim() || "en";
  const languageTranslated =
    String(body.language_translated || "").trim() || "ko";

  const sourceArticleId = String(body.source_article_id || "").trim() || null;
  const customUniqueId = String(body.custom_unique_id || "").trim() || null;

  let duplicateArticleId: string | null = null;

  if (customUniqueId) {
    const { data } = await supabase
      .from("articles")
      .select("id")
      .eq("custom_unique_id", customUniqueId)
      .maybeSingle();

    const row = data as { id: string } | null;
    if (row?.id) {
      duplicateArticleId = row.id;
    }
  }

  if (!duplicateArticleId && sourceArticleId) {
    const { data } = await supabase
      .from("articles")
      .select("id")
      .eq("source", source)
      .eq("source_article_id", sourceArticleId)
      .maybeSingle();

    const row = data as { id: string } | null;
    if (row?.id) {
      duplicateArticleId = row.id;
    }
  }

  if (!duplicateArticleId) {
    const { data } = await supabase
      .from("articles")
      .select("id")
      .eq("source", source)
      .eq("original_url", originalUrl)
      .maybeSingle();

    const row = data as { id: string } | null;
    if (row?.id) {
      duplicateArticleId = row.id;
    }
  }

  if (duplicateArticleId) {
    await supabase.from("collection_logs").insert({
      source,
      checked_count: 1,
      saved_count: 0,
      duplicate_count: 1,
      failed_count: 0,
      status: "success",
      note: "duplicate article skipped",
    });

    return NextResponse.json({
      ok: true,
      duplicate: true,
      article_id: duplicateArticleId,
    });
  }

  const now = Date.now();

  const koTitle = String(body.ko?.title || body.title_translated || "").trim();
  const koBody = String(body.ko?.body || body.body_translated || "").trim();
  const koSummary = String(
    body.ko?.summary || body.summary_translated || ""
  ).trim();

  const enTitle = String(body.en?.title || body.title_original || "").trim();
  const enBody = String(body.en?.body || body.body_original || "").trim();
  const enSummary = String(
    body.en?.summary || body.summary_original || ""
  ).trim();

  const articleInsert = {
    source,
    source_country: sourceCountry,
    source_section: body.source_section || null,
    source_article_id: sourceArticleId,
    original_url: originalUrl,
    canonical_url: body.canonical_url || null,
    title_original: titleOriginal,
    title_ko: body.title_ko || null,
    summary_ko: body.summary_ko || null,
    body_original: body.body_original || null,
    summary_original: body.summary_original || null,
    language_original: languageOriginal,
    language_translated: languageTranslated,
    title_translated: koTitle || null,
    body_translated: koBody || null,
    summary_translated: koSummary || null,
    category: body.category || "other",
    topic_key: body.topic_key || null,
    topic_label: body.topic_label || null,
    thumbnail_url: body.thumbnail_url || null,
    custom_unique_id: customUniqueId,
    ai_review_status: body.ai_review_status || "pending",
    ai_review_notes: body.ai_review_notes || null,
    review_status: "pending",
    revision_status: "none",
    status: "ready_for_human_review",
    is_published: false,
    published_at: null,
    source_published_at: body.source_published_at || body.published_at || null,
    collected_at: new Date().toISOString(),
  };

  const { data: insertedArticle, error: articleError } = await supabase
    .from("articles")
    .insert(articleInsert)
    .select("id")
    .single();

  const article = insertedArticle as { id: string } | null;

  if (articleError || !article) {
    await supabase.from("collection_logs").insert({
      source,
      checked_count: 1,
      saved_count: 0,
      duplicate_count: 0,
      failed_count: 1,
      status: "failed",
      note: articleError?.message || "article insert failed",
    });

    return NextResponse.json({
      ok: true,
      article_id: article?.id ?? null,
});
  }

  const localizations = [];

  if (koTitle) {
    localizations.push({
      article_id: article.id,
      locale: "ko",
      title: koTitle,
      body: koBody || null,
      summary: koSummary || null,
      slug: body.ko?.slug || makeSlug(koTitle, `ko-${now}`),
      meta_description:
        body.ko?.meta_description ||
        koSummary ||
        body.summary_translated ||
        null,
      is_primary_locale: true,
    });
  }

  if (enTitle) {
    localizations.push({
      article_id: article.id,
      locale: "en",
      title: enTitle,
      body: enBody || null,
      summary: enSummary || null,
      slug: body.en?.slug || makeSlug(enTitle, `en-${now}`),
      meta_description:
        body.en?.meta_description || enSummary || body.summary_original || null,
      is_primary_locale: !koTitle,
    });
  }

  if (localizations.length > 0) {
    const { error: localizationError } = await supabase
      .from("article_localizations")
      .insert(localizations);

    if (localizationError) {
      await supabase.from("collection_logs").insert({
        source,
        checked_count: 1,
        saved_count: 0,
        duplicate_count: 0,
        failed_count: 1,
        status: "failed",
        note: localizationError.message,
      });

      return NextResponse.json(
        {
          ok: false,
          error: localizationError.message,
          article_id: article.id,
        },
        { status: 500 }
      );
    }
  }

  await supabase.from("collection_logs").insert({
    source,
    checked_count: 1,
    saved_count: 1,
    duplicate_count: 0,
    failed_count: 0,
    status: "success",
    note: "article ingested",
  });

  return NextResponse.json({
    ok: true,
    article_id: article.id,
  });
}