export type EditorialInterestRule = {
  id: string;
  name: string;
  keywords: string[];
  contentDescription: string | null;
  countries: string[];
  people: string[];
  organizations: string[];
  topics: string[];
  excludeTopics: string[];
  priority: number;
  isActive: boolean;
};

export type InterestMatchResult = {
  ruleId: string;
  ruleName: string;
  priority: number;
  reasons: string[];
  matchType: "keyword" | "semantic" | "topic";
};

export const DEFAULT_EDITORIAL_INTEREST_RULES: EditorialInterestRule[] = [
  {
    id: "default-us-policy",
    name: "미국 정치·경제",
    keywords: ["fed", "white house", "congress", "tariff", "inflation", "election"],
    contentDescription: "US policy and economy with Korean reader impact",
    countries: ["US"],
    people: [],
    organizations: [],
    topics: ["politics", "economy"],
    excludeTopics: ["sports", "celebrity"],
    priority: 10,
    isActive: true,
  },
  {
    id: "default-kr-policy",
    name: "한국 정치·경제",
    keywords: ["대통령", "국회", "금리", "부동산", "정부", "한은"],
    contentDescription: "Korea politics and economy",
    countries: ["KR"],
    people: [],
    organizations: [],
    topics: ["politics", "economy"],
    excludeTopics: [],
    priority: 9,
    isActive: true,
  },
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function haystackForCandidate(input: {
  title: string;
  summary?: string | null;
  source?: string | null;
  sourceCountry?: string | null;
  category?: string | null;
}): string {
  return [
    input.title,
    input.summary ?? "",
    input.source ?? "",
    input.sourceCountry ?? "",
    input.category ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function tokenHits(haystack: string, tokens: string[]): string[] {
  const hits: string[] = [];
  for (const token of tokens) {
    const t = normalizeToken(token);
    if (!t) continue;
    if (haystack.includes(t)) hits.push(token);
  }
  return hits;
}

/** Deterministic interest matching — no OpenAI required. */
export function matchEditorialInterestRules(
  input: {
    title: string;
    summary?: string | null;
    source?: string | null;
    sourceCountry?: string | null;
    category?: string | null;
  },
  rules: EditorialInterestRule[]
): InterestMatchResult[] {
  const haystack = haystackForCandidate(input);
  const results: InterestMatchResult[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;

    const excluded = tokenHits(haystack, rule.excludeTopics);
    if (excluded.length > 0) continue;

    const reasons: string[] = [];
    const keywordHits = tokenHits(haystack, rule.keywords);
    if (keywordHits.length > 0) {
      reasons.push(`키워드: ${keywordHits.slice(0, 3).join(", ")}`);
    }

    const countryHits = tokenHits(
      haystack,
      rule.countries.map((c) => c.toUpperCase()).concat(rule.countries)
    );
    if (countryHits.length > 0) {
      reasons.push(`국가: ${countryHits.join(", ")}`);
    }

    const topicHits = tokenHits(haystack, rule.topics);
    if (topicHits.length > 0) {
      reasons.push(`주제: ${topicHits.join(", ")}`);
    }

    const orgHits = tokenHits(haystack, rule.organizations);
    if (orgHits.length > 0) {
      reasons.push(`기관: ${orgHits.slice(0, 2).join(", ")}`);
    }

    const peopleHits = tokenHits(haystack, rule.people);
    if (peopleHits.length > 0) {
      reasons.push(`인물: ${peopleHits.slice(0, 2).join(", ")}`);
    }

    if (rule.contentDescription && reasons.length > 0) {
      reasons.push(`기준: ${rule.contentDescription.slice(0, 80)}`);
    }

    if (reasons.length === 0) continue;

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      reasons,
      matchType: keywordHits.length > 0 ? "keyword" : "topic",
    });
  }

  return results.sort((a, b) => b.priority - a.priority);
}

export function buildInterestRulesPromptSection(
  rules: EditorialInterestRule[]
): string {
  const active = rules.filter((r) => r.isActive);
  if (active.length === 0) return "";

  const lines = active
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 12)
    .map((rule) => {
      const parts = [
        rule.name,
        rule.keywords.length ? `keywords=${rule.keywords.join("/")}` : null,
        rule.topics.length ? `topics=${rule.topics.join("/")}` : null,
        rule.excludeTopics.length
          ? `exclude=${rule.excludeTopics.join("/")}`
          : null,
        rule.contentDescription
          ? `note=${rule.contentDescription.slice(0, 120)}`
          : null,
      ].filter(Boolean);
      return `- ${parts.join(" · ")}`;
    });

  return (
    "\nActive editorial interest rules (boost matching stories in scoring; " +
    "never auto-publish):\n" +
    lines.join("\n")
  );
}
