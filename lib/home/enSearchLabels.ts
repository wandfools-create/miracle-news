import type { HomeNewsSearchLabels } from "@/components/home/HomeNewsSearch";
import type { NewsSearchResultsLabels } from "@/components/home/NewsSearchResultsView";

export const enHomeSearchLabels: HomeNewsSearchLabels = {
  placeholder: "Search title, body, source, category",
  ariaLabel: "Search news",
  openSearch: "Open search",
  closeSearch: "Close search",
  noResults: "No matching stories.",
  viewAllResultsEmpty: "Go to search results",
};

export const enSearchResultsLabels: NewsSearchResultsLabels = {
  title: "News search",
  homeLink: "English home",
  alternateLang: "한국어",
  placeholder: "Search title, body, source, category",
  empty: "No stories matched your search.",
  emptyHint: "Enter a search term above.",
};
