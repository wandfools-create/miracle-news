import type { CollectRegion } from "@/lib/rss/collectRegions";

export function deskLabelForRegion(region: CollectRegion): string {
  return region === "korea" ? "Korea Desk" : "US / International Desk";
}
