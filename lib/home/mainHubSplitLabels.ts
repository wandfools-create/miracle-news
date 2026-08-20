import type { MainHubSplitLabels } from "@/components/home/MainHubSplitView";
import { koHomeLabels } from "./koHomeLabels";

export const mainHubSplitLabels: MainHubSplitLabels = {
  ...koHomeLabels,
  edition: "한눈",
  tagline:
    "한눈에 보는 글로벌 뉴스. 미국·한국 뉴스를 좌우로 나눠 보여 줍니다.",
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
