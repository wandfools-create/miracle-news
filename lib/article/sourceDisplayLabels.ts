import type { ArticleLocale } from "@/lib/article/formatPublishedDate";
import { sourceConfigs } from "@/lib/article/sourceConfigs";
import { normalizeSource } from "@/lib/article/normalizeSource";

/** English display names for Korean outlets on the EN site. */
const EN_LABEL_BY_KEY: Record<string, string> = {
  insight: "Insight",
  chosun: "Chosun Ilbo",
  joongang: "JoongAng Ilbo",
  tvchosun: "TV Chosun",
  yonhap: "Yonhap News Agency",
  "korea-herald": "The Korea Herald",
  "yonhap-kr-radar": "Yonhap KR Radar",
};

export function englishLabelForSourceKey(key: string): string | null {
  const normalized = normalizeSource(key);
  if (EN_LABEL_BY_KEY[normalized]) return EN_LABEL_BY_KEY[normalized];
  const config = sourceConfigs.find((c) => c.key === normalized);
  if (!config) return null;
  if (/[\u3131-\uD79D]/.test(config.label)) {
    const enAlias = config.aliases.find((a) => !/[\u3131-\uD79D]/.test(a));
    return enAlias ?? null;
  }
  return config.label;
}

export function localizeSourceLabel(
  label: string,
  locale: ArticleLocale,
  sourceKey?: string | null
): string {
  if (locale === "ko") return label;
  if (sourceKey) {
    const fromKey = englishLabelForSourceKey(sourceKey);
    if (fromKey) return fromKey;
  }
  const fromLabel = matchSourceKeyFromDisplayLabel(label);
  if (fromLabel) {
    const en = englishLabelForSourceKey(fromLabel);
    if (en) return en;
  }
  if (/[\u3131-\uD79D]/.test(label)) return label;
  return label;
}

function matchSourceKeyFromDisplayLabel(label: string): string | null {
  const trimmed = label.trim();
  for (const config of sourceConfigs) {
    if (
      config.label === trimmed ||
      config.aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())
    ) {
      return config.key;
    }
  }
  return null;
}
