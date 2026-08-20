import type { Metadata, Viewport } from "next";
import Link from "next/link";
import SiteBrandLink from "@/components/layout/SiteBrandLink";
import { buildRootMetadata } from "@/lib/seo/metadata";
import "./globals.css";

export const metadata: Metadata = buildRootMetadata();

/** 실제 아이폰 등에서 레이아웃·노치 대응 (CSS env(safe-area-inset-*)) */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white text-slate-800">
        <header className="border-b-4 border-news-red bg-news-navy text-white">
          <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6 sm:py-2.5 lg:px-8 xl:px-10">
            <SiteBrandLink className="min-h-10 shrink-0 content-center text-[14px] font-bold tracking-tight text-white hover:text-white/90 sm:min-h-0 sm:text-[15px]" />

            <nav className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-x-2 overflow-x-auto py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] text-[11px] font-semibold uppercase tracking-[0.05em] text-white/85 sm:flex-none sm:gap-x-4 sm:overflow-visible sm:py-0 sm:text-[12px] sm:tracking-[0.06em] [&::-webkit-scrollbar]:hidden">
              <Link
                href="/ko"
                className="shrink-0 whitespace-nowrap py-1.5 hover:text-white sm:py-0"
              >
                한국어
              </Link>
              <Link
                href="/en"
                className="shrink-0 whitespace-nowrap py-1.5 hover:text-white sm:py-0"
              >
                English
              </Link>
              <Link
                href="/admin"
                className="shrink-0 whitespace-nowrap py-1.5 text-white/70 hover:text-white sm:py-0"
              >
                관리자
              </Link>
            </nav>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
