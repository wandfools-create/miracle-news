import type { Metadata } from "next";
import { adminRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "관리자",
  robots: adminRobots,
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
