import Image from "next/image";

import type { HomeArticleCard } from "@/lib/home/types";

type Props = {
  article: Pick<HomeArticleCard, "thumbnail_url" | "title">;
  noImageLabel: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  /** Prefer next/image when true (default). Hub views may use plain img. */
  useNextImage?: boolean;
};

/**
 * Fixed-box news thumbnail: full photo visible (object-contain), centered on white.
 * Does not crop faces/scenes to fill the frame.
 */
export default function NewsThumbnail({
  article,
  noImageLabel,
  priority = false,
  className = "",
  sizes = "100vw",
  useNextImage = true,
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

  const fitClass = "h-full w-full object-contain object-center";

  if (!useNextImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- optional plain img for hub views
      <img
        src={article.thumbnail_url}
        alt={article.title || ""}
        className={`${fitClass} ${className}`}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }

  return (
    <Image
      src={article.thumbnail_url}
      alt={article.title || ""}
      fill
      sizes={sizes}
      className={`${fitClass} ${className}`}
      priority={priority}
    />
  );
}

/** Wrapper classes for fixed thumbnail frames (keep layout size; white letterbox). */
export const newsThumbFrameClass =
  "relative overflow-hidden bg-white flex items-center justify-center";
