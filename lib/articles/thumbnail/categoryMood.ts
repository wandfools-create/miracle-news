export type CategoryMood = {
  label: string;
  mood: string;
  palette: string;
  symbols: string;
};

const moods: Record<string, CategoryMood> = {
  politics: {
    label: "정치",
    mood: "serious, institutional, measured tension",
    palette: "deep navy, slate gray, muted red accents",
    symbols: "abstract capitol dome, ballot, podium silhouettes (not realistic)",
  },
  economy: {
    label: "경제",
    mood: "analytical, forward-looking, steady",
    palette: "teal, forest green, cool gray",
    symbols: "abstract chart lines, coins, factory or market icons (stylized)",
  },
  society: {
    label: "사회",
    mood: "human-centered, community, empathetic",
    palette: "warm beige, soft orange, gentle blue",
    symbols: "connected people icons, city skyline simplified",
  },
  world: {
    label: "국제",
    mood: "global, diplomatic, wide perspective",
    palette: "ocean blue, white, soft gold",
    symbols: "stylized globe, connection arcs between regions",
  },
  religion: {
    label: "종교",
    mood: "respectful, calm, contemplative",
    palette: "soft gold, cream, muted purple",
    symbols: "light rays, simple architectural arch (non-denominational)",
  },
  other: {
    label: "일반",
    mood: "neutral newsroom, informative",
    palette: "news blue, light gray, white",
    symbols: "newspaper, speech bubble, abstract headline blocks",
  },
};

export function getCategoryMood(category: string | null | undefined): CategoryMood {
  const key = (category || "other").trim().toLowerCase();
  return moods[key] ?? moods.other;
}
