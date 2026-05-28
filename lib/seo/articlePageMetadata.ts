import type { Metadata } from "next";
import { buildArticleMetadata } from "@/lib/seo/metadata";
import { fetchPublishedArticleSeo } from "@/lib/seo/fetchPublishedArticleSeo";

export async function generatePublishedArticleMetadata(
  locale: "ko" | "en",
  rawSlug: string
): Promise<Metadata> {
  const slug = decodeURIComponent(rawSlug);
  const seo = await fetchPublishedArticleSeo(locale, slug);

  if (!seo) {
    return {
      title: locale === "ko" ? "기사를 찾을 수 없음" : "Article not found",
      robots: { index: false, follow: false },
    };
  }

  return buildArticleMetadata({
    locale,
    title: seo.title,
    description: seo.description,
    slug: seo.slug,
    thumbnailUrl: seo.thumbnailUrl,
    publishedAt: seo.publishedAt,
  });
}
