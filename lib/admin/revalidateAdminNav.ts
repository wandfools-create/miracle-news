import "server-only";

import { updateTag } from "next/cache";
import { ADMIN_NAV_COUNTS_TAG } from "@/lib/admin/adminNavCounts";

/** Invalidate cached admin nav badge counts after status-changing mutations. */
export function revalidateAdminNavCountsCache(): void {
  updateTag(ADMIN_NAV_COUNTS_TAG);
}
