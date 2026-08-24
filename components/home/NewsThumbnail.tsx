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
 * Full photo visible (object-contain), horizontally & vertically centered on white.
 * Uses flex centering (not absolute top-left fill) so letterboxed images sit mid-frame.
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

  const imgClass =
    "h-auto max-h-full w-auto max-w-full object-contain object-center";

  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-white ${className}`}
    >
      {useNextImage ? (
        <Image
          src={article.thumbnail_url}
          alt={article.title || ""}
          width={1600}
          height={900}
          sizes={sizes}
          className={imgClass}
          priority={priority}
          style={{ objectPosition: "center center" }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- optional plain img for hub views
        <img
          src={article.thumbnail_url}
          alt={article.title || ""}
          className={imgClass}
          loading={priority ? "eager" : "lazy"}
          style={{ objectPosition: "center center" }}
        />
      )}
    </div>
  );
}

/** Fixed thumbnail frame: keep card layout size; white letterbox; center child. */
export const newsThumbFrameClass =
  "relative overflow-hidden bg-white flex items-center justify-center";
