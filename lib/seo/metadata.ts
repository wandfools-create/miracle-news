import type { Metadata } from "next";
import {
  BRAND_NAME_EN,
  BRAND_NAME_KO,
  SITE_TAGLINE_EN,
  SITE_TAGLINE_KO,
  getBrandName,
} from "@/lib/brand";
import { absoluteUrl, getSiteUrl } from "@/lib/seo/site";

export const adminRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export function buildRootMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    applicationName: BRAND_NAME_KO,
    title: {
      default: `${BRAND_NAME_KO} | Hannoon`,
      template: `%s | ${BRAND_NAME_KO}`,
    },
    description: `${SITE_TAGLINE_KO}. 검토 후 공개된 한국·국제 뉴스를 한곳에서 읽을 수 있습니다.`,
    openGraph: {
      siteName: BRAND_NAME_KO,
      type: "website",
      locale: "ko_KR",
      alternateLocale: ["en_US"],
      title: BRAND_NAME_KO,
      description: SITE_TAGLINE_KO,
    },
    twitter: {
      card: "summary_large_image",
      title: BRAND_NAME_KO,
      description: SITE_TAGLINE_KO,
    },
  };
}

export function buildKoHomeMetadata(): Metadata {
  const brand = getBrandName("ko");
  const title = brand;
  const description = `${SITE_TAGLINE_KO}. 검토 후 공개된 한국어·국제 뉴스. 대표 기사, 카테고리, 주요 언론사별로 모았습니다.`;
  const url = absoluteUrl("/ko");

  return {
    title: {
      default: title,
      template: `%s | ${BRAND_NAME_KO}`,
    },
    description,
    alternates: {
      canonical: url,
      languages: { ko: url, en: absoluteUrl("/en") },
    },
    openGraph: {
      title: `${title} | ${SITE_TAGLINE_KO}`,
      description,
      url,
      locale: "ko_KR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_TAGLINE_KO}`,
      description,
    },
  };
}

export function buildEnHomeMetadata(): Metadata {
  const brand = getBrandName("en");
  const title = brand;
  const description = `${SITE_TAGLINE_EN}. Editor-reviewed English news from Korea and international sources.`;
  const url = absoluteUrl("/en");

  return {
    title: {
      default: title,
      template: `%s | ${BRAND_NAME_EN}`,
    },
    description,
    alternates: {
      canonical: url,
      languages: { en: url, ko: absoluteUrl("/ko") },
    },
    openGraph: {
      title: `${title} | ${SITE_TAGLINE_EN}`,
      description,
      url,
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_TAGLINE_EN}`,
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
  const brand = getBrandName(input.locale);

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
      title: `${pageTitle} | ${brand}`,
      description,
      url,
      type: "article",
      siteName: brand,
      locale: input.locale === "ko" ? "ko_KR" : "en_US",
      publishedTime: input.publishedAt ?? undefined,
      ...(imageUrl
        ? { images: [{ url: imageUrl, alt: pageTitle }] }
        : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: `${pageTitle} | ${brand}`,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}
