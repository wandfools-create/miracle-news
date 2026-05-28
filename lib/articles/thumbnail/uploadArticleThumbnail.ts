import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "article-thumbnails";

export type UploadArticleThumbnailResult =
  | { ok: true; publicUrl: string; storagePath: string }
  | { ok: false; error: string };

function getThumbnailBucket(): string {
  return (
    process.env.SUPABASE_THUMBNAIL_BUCKET?.trim() || DEFAULT_BUCKET
  );
}

function buildPublicUrl(supabaseUrl: string, bucket: string, path: string): string {
  const base = supabaseUrl.replace(/\/$/, "");
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

/**
 * Upload PNG bytes to Supabase Storage and return a public URL.
 */
export async function uploadArticleThumbnail(
  supabase: SupabaseClient,
  input: {
    articleId: string;
    buffer: Buffer;
    supabaseProjectUrl: string;
  }
): Promise<UploadArticleThumbnailResult> {
  const bucket = getThumbnailBucket();
  const storagePath = `articles/${input.articleId}/thumbnail-${Date.now()}.png`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, input.buffer, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    });

  if (error) {
    return {
      ok: false,
      error: `Storage upload failed (${bucket}): ${error.message}`,
    };
  }

  const publicUrl = buildPublicUrl(
    input.supabaseProjectUrl,
    bucket,
    storagePath
  );

  return { ok: true, publicUrl, storagePath };
}
