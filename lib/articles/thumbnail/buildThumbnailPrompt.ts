import { getCategoryMood } from "./categoryMood";

export function buildThumbnailImagePrompt(input: {
  category: string | null | undefined;
  titleKo: string;
  summaryKo?: string | null;
}): string {
  const mood = getCategoryMood(input.category);
  const title = input.titleKo.trim().slice(0, 200);
  const summary = (input.summaryKo || "").trim().slice(0, 280);

  return [
    "Create a single editorial news illustration for a Korean news website thumbnail.",
    "STYLE (mandatory): clean flat vector or soft digital editorial illustration.",
    "NOT a photograph. NOT photorealistic. NOT a fake breaking-news photo or staged press scene.",
    "No camera realism, no gritty documentary look, no sensational disaster imagery.",
    "No text, letters, numbers, logos, watermarks, or UI chrome in the image.",
    "No recognizable real politicians, celebrities, or identifiable human faces.",
    "Use abstract symbolic shapes and simplified figures only if needed.",
    `Category: ${mood.label}. Mood: ${mood.mood}.`,
    `Color palette: ${mood.palette}.`,
    `Visual motifs (abstract): ${mood.symbols}.`,
    `Article topic (symbolize only, do not quote text): ${title}`,
    summary ? `Context: ${summary}` : null,
    "Composition: calm, trustworthy, professional newspaper digital art, 16:9 friendly layout with clear focal subject and generous negative space.",
  ]
    .filter(Boolean)
    .join(" ");
}
