import Image from "next/image";
import type { ReactNode } from "react";

import type { HomeArticleCard } from "@/lib/home/types";

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
   * cover: fill fixed frame, center-crop — list thumbnails for visual uniformity.
   */
  objectFit?: "contain" | "cover";
};

/**
 * Thumbnail inside a sized frame (`newsThumbFrameClass` + aspect/size on parent).
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
}: Props) {
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

  const isCover = objectFit === "cover";
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

/** Fixed thumbnail frame: keep card layout size; white letterbox; center child. */
export const newsThumbFrameClass =
  "relative overflow-hidden bg-white flex items-center justify-center";
