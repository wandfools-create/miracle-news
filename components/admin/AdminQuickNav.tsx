"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";

type AdminQuickNavProps = {
  userEmail?: string | null;
  counts: {
    review: number;
    quickReview: number;
    collectionCandidates: number;
    collectionShortlist: number;
    onHold: number;
    revision: number;
    approved: number;
    published: number;
    rejected: number;
  };
};

const navItems = [
  { href: "/admin", label: "관리자 홈", key: "home" },
  { href: "/admin/from-link", label: "링크 초안", key: "from-link" },
  {
    href: "/admin/collection-candidates",
    label: "수집 후보",
    key: "collection-candidates",
  },
  {
    href: "/admin/collection-shortlist",
    label: "편집 보관함",
    key: "collection-shortlist",
  },
  { href: "/admin/quick-review", label: "빠른 검토", key: "quick-review" },
  { href: "/admin/review", label: "검토 대기", key: "review" },
  { href: "/admin/on-hold", label: "보류 기사", key: "on-hold" },
  { href: "/admin/revision", label: "수정 대기", key: "revision" },
  { href: "/admin/approved", label: "승인 완료", key: "approved" },
  { href: "/admin/published", label: "공개 기사", key: "published" },\n  { href: "/admin/shorts", label: "Shorts 제작실", key: "shorts" },
  { href: "/admin/rejected", label: "반려 기사", key: "rejected" },
  { href: "/admin/archive", label: "보관함", key: "archive" },
  { href: "/admin/cleanup", label: "오래된 정리", key: "cleanup" },
] as const;

export default function AdminQuickNav({ counts, userEmail }: AdminQuickNavProps) {
  const pathname = usePathname();

  function getCount(key: string) {
    if (key === "review") return counts.review;
    if (key === "quick-review") return counts.quickReview;
    if (key === "collection-candidates") return counts.collectionCandidates;
    if (key === "collection-shortlist") return counts.collectionShortlist;
    if (key === "on-hold") return counts.onHold;
    if (key === "revision") return counts.revision;
    if (key === "approved") return counts.approved;
    if (key === "published") return counts.published;
    if (key === "rejected") return counts.rejected;
    return null;
  }

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <div className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <section className="mx-auto max-w-6xl px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-wide text-gray-500">
              관리자 빠른 메뉴
            </p>
            {userEmail ? (
              <p className="mt-1 text-xs text-gray-500">로그인: {userEmail}</p>
            ) : null}
          </div>
          <AdminLogoutButton />
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const count = getCount(item.key);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
                }`}
              >
                <span>{item.label}</span>
                {count !== null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}