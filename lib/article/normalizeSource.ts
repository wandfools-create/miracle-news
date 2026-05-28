import { sourceConfigs } from "@/lib/article/sourceConfigs";

export function normalizeSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();

  for (const config of sourceConfigs) {
    if (config.key === lower) return config.key;
    if (config.aliases.some((alias) => alias.toLowerCase() === lower)) {
      return config.key;
    }
  }

  for (const config of sourceConfigs) {
    if (
      config.aliases.some(
        (alias) =>
          alias.length >= 2 &&
          (lower.includes(alias.toLowerCase()) ||
            alias.toLowerCase().includes(lower))
      )
    ) {
      return config.key;
    }
  }

  if (/fox\s*news/i.test(trimmed)) return "fox-news";
  if (lower === "ap" || /\bassociated\s+press\b/i.test(trimmed)) return "ap";
  if (/\bcnn\b/i.test(trimmed) || /cable\s+news\s+network/i.test(trimmed)) {
    return "cnn";
  }
  if (
    /christian\s+science\s+monitor/i.test(trimmed) ||
    /\bcsm\b/i.test(trimmed)
  ) {
    return "csm";
  }
  if (/\breuters\b/i.test(trimmed)) return "reuters";

  return lower.replace(/\s+/g, "-");
}
