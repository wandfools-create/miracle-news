/** Pure layout decisions for the home center grid — unit-testable, no React. */

export function shouldShowTopStoriesBand(input: {
  showTopStories: boolean;
  isCarryover: boolean;
  useFeaturedComboLayout: boolean;
}): boolean {
  if (!input.showTopStories) return false;
  if (input.isCarryover) return false;
  if (input.useFeaturedComboLayout) return false;
  return true;
}

/** Related rows already render inside FeaturedWithRelated — avoid duplicate #latest band. */
export function shouldShowLatestFallbackSection(input: {
  showTopStoriesBand: boolean;
  useFeaturedComboLayout: boolean;
  latestCount: number;
}): boolean {
  if (input.showTopStoriesBand) return false;
  if (input.useFeaturedComboLayout) return false;
  return input.latestCount > 0;
}

/** Secondary center bands sit below featured when the featured block is visible. */
export function centerBandGridRowClass(hasFeaturedBlock: boolean): string {
  return hasFeaturedBlock ? "xl:row-start-3" : "xl:row-start-2";
}

export function isGlobalHomeFilterMode(input: {
  sourceFromUrl: string | null;
  categoryFromUrl: string | null;
}): boolean {
  return Boolean(input.sourceFromUrl || input.categoryFromUrl);
}

/** Desktop home always keeps the newspaper 3-column grid when edition content is shown. */
export function shouldUseNewspaperThreeColGrid(input: {
  showEditionHome: boolean;
}): boolean {
  return input.showEditionHome;
}

export function homeLeftRailColClass(): string {
  return "xl:col-start-1";
}

export function homeFeaturedCenterColClass(): string {
  return "xl:col-start-2";
}

export function homeRightRailColClass(): string {
  return "xl:col-start-3";
}

export function centerBandGridColClass(): string {
  return "xl:col-span-2 xl:col-start-1";
}
