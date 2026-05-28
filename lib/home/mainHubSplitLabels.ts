import type { MainHubSplitLabels } from "@/components/home/MainHubSplitView";
import { koHomeLabels } from "./koHomeLabels";

export const mainHubSplitLabels: MainHubSplitLabels = {
  ...koHomeLabels,
  edition: "메인 뉴스",
  tagline:
    "미국·한국 뉴스를 좌우로 나눠 보여 줍니다. 각 칼럼에 주요·최신·언론사·카테고리·YouTube·SNS 기사를 모았습니다.",
  featuredTitle: "주요 기사",
  latestTitle: "최신 기사",
  latestDesc: "발행일 최신순입니다.",
  navHome: "한국어",
  alternateLang: "English",
  empty: "현재 공개된 기사가 없습니다.",
  usColumnTitle: "미국 뉴스",
  krColumnTitle: "한국 뉴스",
  usColumnDesc: "영어·미국 출처 기사",
  krColumnDesc: "한국어·한국 출처 기사",
  socialEyebrow: "Video & Social",
  socialTitle: "YouTube · SNS",
  socialDesc: "영상·소셜 링크로 등록된 기사입니다.",
  columnEmpty: "이 지역에 해당하는 공개 기사가 없습니다.",
};
