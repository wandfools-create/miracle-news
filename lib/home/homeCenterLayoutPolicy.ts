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
