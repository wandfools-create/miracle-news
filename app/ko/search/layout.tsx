import type { Metadata } from "next";
import { adminRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "뉴스 검색",
  robots: adminRobots,
};

export default function KoreanSearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
