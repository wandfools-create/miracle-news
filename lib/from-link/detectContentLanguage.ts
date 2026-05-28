export type ContentLanguage = "ko" | "en" | "unknown";

export function detectContentLanguage(text: string): ContentLanguage {
  const sample = text.slice(0, 8000);
  const hangul = (sample.match(/[\uAC00-\uD7A3\u3131-\u318E]/g) || []).length;
  const latin = (sample.match(/[a-zA-Z]/g) || []).length;

  if (hangul >= 40 && hangul >= latin * 0.35) return "ko";
  if (latin >= 80 && latin >= hangul * 1.8) return "en";
  if (hangul > latin && hangul >= 15) return "ko";
  if (latin > hangul && latin >= 30) return "en";
  return "unknown";
}
