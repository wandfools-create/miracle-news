import {
  resolvePublisherFromUrl,
  type ResolvedPublisherSource,
} from "@/lib/article/sourceResolution";
import type { ExtractedPreview, LinkType } from "./types";

export type { ResolvedPublisherSource };

export function resolvePublisherFromExtracted(
  pageUrl: string,
  extracted: ExtractedPreview,
  linkType: LinkType
): ResolvedPublisherSource {
  const resolved = resolvePublisherFromUrl(pageUrl, {
    siteName: extracted.siteName,
    channelName: linkType === "youtube" ? extracted.author : null,
  });

  if (resolved) return resolved;

  return {
    source: linkType === "youtube" ? "YouTube" : "Web",
    label: linkType === "youtube" ? "YouTube" : "Web",
    sourceCountry: "US",
  };
}
