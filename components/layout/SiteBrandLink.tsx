"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_NAME_EN, BRAND_NAME_KO } from "@/lib/brand";

export default function SiteBrandLink({
  className = "",
}: {
  className?: string;
}) {
  const pathname = usePathname();
  const isEnglish = pathname?.startsWith("/en") ?? false;
  const name = isEnglish ? BRAND_NAME_EN : BRAND_NAME_KO;
  const href = isEnglish ? "/en" : "/ko";

  return (
    <Link href={href} className={className}>
      {name}
    </Link>
  );
}
