import type { Metadata } from "next";
import { buildKoHomeMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildKoHomeMetadata();

export default function KoreanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
