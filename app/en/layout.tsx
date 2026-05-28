import type { Metadata } from "next";
import { buildEnHomeMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildEnHomeMetadata();

export default function EnglishLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
