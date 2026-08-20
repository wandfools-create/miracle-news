import type { Metadata } from "next";
import { BRAND_NAME_KO } from "@/lib/brand";
import { adminRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: `관리자 | ${BRAND_NAME_KO}`,
  robots: adminRobots,
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
