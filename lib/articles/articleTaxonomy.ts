import { categoryOrder } from "@/lib/koreanArticleDisplay";

export const ARTICLE_CATEGORIES = categoryOrder;

const CATEGORY_ALIASES: Record<string, (typeof categoryOrder)[number]> = {
  international: "world",
  world_news: "world",
  global: "world",
  tech: "other",
  technology: "other",
  culture: "other",
  entertainment: "other",
};

export function normalizeArticleCategory(value: unknown): string {
  if (typeof value !== "string") return "other";
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = CATEGORY_ALIASES[normalized] ?? normalized;
  return (ARTICLE_CATEGORIES as readonly string[]).includes(mapped)
    ? mapped
    : "other";
}

export function normalizeTopicKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug.length >= 3 ? slug : null;
}

export function normalizeTopicLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim().replace(/\s+/g, " ");
  return label.length >= 2 ? label.slice(0, 120) : null;
}

export function parseEditorTaxonomy(data: Record<string, unknown>): {
  category: string;
  topicKey: string | null;
  topicLabel: string | null;
} {
  const topicLabelRaw =
    data.topic_label_ko ?? data.topic_label ?? data.topicLabel;
  return {
    category: normalizeArticleCategory(data.category),
    topicKey: normalizeTopicKey(data.topic_key ?? data.topicKey),
    topicLabel: normalizeTopicLabel(topicLabelRaw),
  };
}
