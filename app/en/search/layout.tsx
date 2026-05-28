import type { Metadata } from "next";
import { adminRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "News search",
  robots: adminRobots,
};

export default function EnglishSearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
