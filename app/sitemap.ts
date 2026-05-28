import type { MetadataRoute } from "next";
import { fetchPublishedSitemapEntries } from "@/lib/seo/fetchPublishedArticleSeo";
import { getSiteUrl } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${base}/ko`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${base}/en`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
  ];

  const articles = await fetchPublishedSitemapEntries();

  const articleRoutes: MetadataRoute.Sitemap = articles.map((entry) => ({
    url: `${base}/${entry.locale}/article/${encodeURIComponent(entry.slug)}`,
    lastModified: entry.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...articleRoutes];
}
