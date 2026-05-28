import type { HomeArticleCard, SourceLeadCard } from "./types";
import type { ArticleRegion } from "./articleRegion";

export type MainHubColumnSections = {
  region: ArticleRegion;
  featured: HomeArticleCard | null;
  latest: HomeArticleCard[];
  sourceLeadCards: SourceLeadCard[];
  groupedByCategory: Record<string, HomeArticleCard[]>;
  visibleCategories: string[];
  socialArticles: HomeArticleCard[];
};

export type MainHubSplitSections = {
  us: MainHubColumnSections;
  kr: MainHubColumnSections;
};
