import type { HomeNewsLabels } from "@/components/home/HomeNewsView";
import { koHomeLabels } from "./koHomeLabels";

/** Labels for bilingual main hub (/). */
export const mainHubLabels: HomeNewsLabels = {
  ...koHomeLabels,
  edition: "한눈",
  tagline:
    "한눈에 보는 글로벌 뉴스. 한국어·영어 검토 기사를 한곳에서 모읍니다.",
  featuredTitle: "대표 기사",
  latestTitle: "주요 기사",
  latestDesc:
    "미국·한국 기사를 균형 있게 배치합니다 (발행일 최신순, 약 50:50).",
  sidebarTitle: "지금 주목",
  sidebarDesc: "다른 섹션에 올라온 최근 헤드라인입니다.",
  navLatest: "주요 기사",
  navHome: "한국어",
  alternateLang: "English",
  empty: "현재 공개된 기사가 없습니다.",
};
