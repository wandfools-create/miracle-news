import { parseCandidateCategoryFilter } from "@/lib/collection-candidates/candidateCategory";
import {
  candidateListSearchParams,
  parseCandidateView,
} from "@/lib/collection-candidates/candidateListQuery";
import {
  buildScrollHash,
  parseScrollYFormValue,
} from "@/lib/collection-candidates/candidateListScroll";

/** Shared redirect path builder for collection-candidate server actions. */
export function collectionCandidatesListPath(
  formData: FormData,
  extra?: Record<string, string>
): string {
  const view = parseCandidateView(String(formData.get("viewFilter") ?? ""));
  const params = new URLSearchParams(
    candidateListSearchParams({
      view,
      status: String(formData.get("statusFilter") ?? "").trim() ||
        (view === "older" || view === "recent" ? "pending" : "actionable"),
      source: String(formData.get("sourceFilter") ?? "").trim() || "all",
      date: String(formData.get("dateFilter") ?? "").trim() || "all",
      category: parseCandidateCategoryFilter(
        String(formData.get("categoryFilter") ?? "")
      ),
    })
  );
  if (String(formData.get("advanced") ?? "").trim() === "1") {
    params.set("advanced", "1");
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (key === "scrollY") continue;
      params.set(key, value);
    }
  }
  const path = `/admin/collection-candidates?${params.toString()}`;
  const scrollY =
    parseScrollYFormValue(formData.get("scrollY")) ??
    parseScrollYFormValue(extra?.scrollY ?? null);
  if (scrollY != null) {
    return `${path}#${buildScrollHash(scrollY)}`;
  }
  return path;
}
