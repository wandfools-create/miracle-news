import type { HomeNewsSearchLabels } from "@/components/home/HomeNewsSearch";
import type { NewsSearchResultsLabels } from "@/components/home/NewsSearchResultsView";

export const koHomeSearchLabels: HomeNewsSearchLabels = {
  placeholder: "제목, 본문, 출처, 카테고리 검색",
  ariaLabel: "뉴스 검색",
  openSearch: "검색 열기",
  closeSearch: "검색 닫기",
  noResults: "일치하는 기사가 없습니다.",
  viewAllResultsEmpty: "검색 결과 페이지로 이동",
};

export const koSearchResultsLabels: NewsSearchResultsLabels = {
  title: "뉴스 검색",
  homeLink: "한눈 홈",
  alternateLang: "English",
  placeholder: "제목, 본문, 출처, 카테고리 검색",
  empty: "검색 결과가 없습니다.",
  emptyHint: "검색어를 입력해 주세요.",
};
