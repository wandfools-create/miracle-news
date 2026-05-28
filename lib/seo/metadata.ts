import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl, getSiteUrl } from "@/lib/seo/site";

export const adminRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export function buildRootMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    },
    description:
      "AI-assisted, editor-reviewed newsroom covering Korea and international stories.",
    openGraph: {
      siteName: SITE_NAME,
      type: "website",
      locale: "ko_KR",
      alternateLocale: ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
    },
  };
}

export function buildKoHomeMetadata(): Metadata {
  const title = "한국어 뉴스";
  const description =
    "검토 후 공개된 한국어·국제 뉴스. 대표 기사, 카테고리, 주요 언론사별로 모았습니다.";
  const url = absoluteUrl("/ko");

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { ko: url, en: absoluteUrl("/en") },
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: "ko_KR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export function buildEnHomeMetadata(): Metadata {
  const title = "English News";
  const description =
    "Editor-reviewed English news from Korea and international sources — headlines, categories, and major outlets.";
  const url = absoluteUrl("/en");

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { en: url, ko: absoluteUrl("/ko") },
    },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export function buildArticleMetadata(input: {
  locale: "ko" | "en";
  title: string;
  description: string;
  slug: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}): Metadata {
  const path = `/${input.locale}/article/${encodeURIComponent(input.slug)}`;
  const url = absoluteUrl(path);
  const pageTitle = input.title;
  const description = input.description.slice(0, 160);

  const thumb = input.thumbnailUrl?.trim();
  const imageUrl = thumb ? absoluteUrl(thumb) : null;

  const alternateLocale = input.locale === "ko" ? "en" : "ko";
  const alternatePath = `/${alternateLocale}`;

  return {
    title: pageTitle,
    description,
    alternates: {
      canonical: url,
      languages: {
        [input.locale]: url,
        [alternateLocale]: absoluteUrl(alternatePath),
      },
    },
    openGraph: {
      title: `${pageTitle} | ${SITE_NAME}`,
      description,
      url,
      type: "article",
      locale: input.locale === "ko" ? "ko_KR" : "en_US",
      publishedTime: input.publishedAt ?? undefined,
      ...(imageUrl
        ? { images: [{ url: imageUrl, alt: pageTitle }] }
        : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: `${pageTitle} | ${SITE_NAME}`,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}
