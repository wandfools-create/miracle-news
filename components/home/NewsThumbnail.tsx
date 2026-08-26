import Image from "next/image";
import type { ReactNode } from "react";

import type { HomeArticleCard } from "@/lib/home/types";

/** Fixed thumbnail frame: keep card layout size; white letterbox; center child. */
export const newsThumbFrameClass =
  "relative overflow-hidden bg-white flex items-center justify-center";

/**
 * Layout / crop policy for home thumbnails.
 * - hero: full photo, letterbox (contain)
 * - sourceCard / categoryCard / listThumb: uniform 16:10 cover crop
 */
export type NewsThumbVariant =
  | "hero"
  | "sourceCard"
  | "categoryCard"
  | "listThumb";

export function newsThumbFitForVariant(
  variant: NewsThumbVariant
): "contain" | "cover" {
  return variant === "hero" ? "contain" : "cover";
}

/** Outer frame class per variant — width 100%, no per-card min/max height. */
export function newsThumbFrameForVariant(variant: NewsThumbVariant): string {
  switch (variant) {
    case "hero":
      return `${newsThumbFrameClass} aspect-video w-full`;
    case "sourceCard":
    case "categoryCard":
      return `${newsThumbFrameClass} aspect-[16/10] w-full`;
    case "listThumb":
      return `${newsThumbFrameClass} aspect-[16/10] h-full w-full`;
  }
}

type Props = {
  article: Pick<HomeArticleCard, "thumbnail_url" | "title">;
  noImageLabel: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  /** Prefer next/image when true (default). Hub views may use plain img. */
  useNextImage?: boolean;
  /**
   * contain (default): show full photo, letterbox on white — Hero / large cards.
   * cover: fill fixed frame, center-crop — repeating card / list thumbs.
   * Ignored when `variant` is set (variant wins).
   */
  objectFit?: "contain" | "cover";
  /** Preferred: picks object-fit from the home thumbnail policy. */
  variant?: NewsThumbVariant;
};

/**
 * Thumbnail inside a sized frame (`newsThumbFrameForVariant` / `newsThumbFrameClass`).
 * contain: flex-centered letterbox. cover: absolute fill + center crop.
 */
export default function NewsThumbnail({
  article,
  noImageLabel,
  priority = false,
  className = "",
  sizes = "100vw",
  useNextImage = true,
  objectFit = "contain",
  variant,
}: Props) {
  const resolvedFit = variant
    ? newsThumbFitForVariant(variant)
    : objectFit;

  if (!article.thumbnail_url) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center bg-white text-center text-xs text-neutral-400 ${className}`}
      >
        <span className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-[10px] font-semibold text-neutral-500">
          AI
        </span>
        {noImageLabel}
      </div>
    );
  }

  const isCover = resolvedFit === "cover";
  const imgClass = isCover
    ? "absolute inset-0 h-full w-full object-cover object-center"
    : "h-auto max-h-full w-auto max-w-full object-contain object-center";
  const imgStyle = { objectPosition: "center center" as const };

  let media: ReactNode;
  if (useNextImage && isCover) {
    media = (
      <Image
        src={article.thumbnail_url}
        alt={article.title || ""}
        fill
        sizes={sizes}
        className={imgClass}
        priority={priority}
        style={imgStyle}
      />
    );
  } else if (useNextImage) {
    media = (
      <Image
        src={article.thumbnail_url}
        alt={article.title || ""}
        width={1600}
        height={900}
        sizes={sizes}
        className={imgClass}
        priority={priority}
        style={imgStyle}
      />
    );
  } else {
    media = (
      // eslint-disable-next-line @next/next/no-img-element -- optional plain img for hub views
      <img
        src={article.thumbnail_url}
        alt={article.title || ""}
        className={imgClass}
        loading={priority ? "eager" : "lazy"}
        style={imgStyle}
      />
    );
  }

  return (
    <div
      className={
        isCover
          ? `relative h-full w-full bg-white ${className}`
          : `flex h-full w-full items-center justify-center bg-white ${className}`
      }
    >
      {media}
    </div>
  );
}
