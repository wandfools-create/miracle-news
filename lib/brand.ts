export const BRAND_NAME_KO = "한눈";
export const BRAND_NAME_EN = "Hannoon";

export const SITE_TAGLINE_KO = "한눈에 보는 글로벌 뉴스";
export const SITE_TAGLINE_EN = "Global news at a glance";

/** Default site name for shared metadata (Korean primary). */
export const SITE_NAME = BRAND_NAME_KO;

export function getBrandName(locale: "ko" | "en"): string {
  return locale === "en" ? BRAND_NAME_EN : BRAND_NAME_KO;
}

export function getSiteTagline(locale: "ko" | "en"): string {
  return locale === "en" ? SITE_TAGLINE_EN : SITE_TAGLINE_KO;
}
