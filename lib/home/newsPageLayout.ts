/** Shared width + spacing for public news pages. */
export const newsPageShell =
  "mx-auto w-full max-w-[1440px] px-4 sm:px-5 lg:px-8 xl:px-10";

/** Legacy 2-col (main + right rail) — still used where only one rail exists. */
export const newsMainGrid =
  "grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(100%,320px)] lg:gap-10 xl:gap-12";

/**
 * Newspaper 3-column home layout (wide desktop only).
 * Left ~260–300px · center flexible · right ~300–340px.
 * No sticky; panels scroll away with the page.
 */
export const newsHomeThreeColGrid =
  "flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(260px,280px)_minmax(0,1fr)_minmax(300px,340px)] xl:items-start xl:gap-8 2xl:grid-cols-[minmax(280px,300px)_minmax(0,1fr)_minmax(320px,340px)] 2xl:gap-10";

export const newsHomeLeftOnlyGrid =
  "flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(260px,280px)_minmax(0,1fr)] xl:items-start xl:gap-8 2xl:grid-cols-[minmax(280px,300px)_minmax(0,1fr)]";

export const newsHomeRightOnlyGrid =
  "flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] xl:items-start xl:gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,340px)]";

export type NewsPageRole = "ko" | "en";
