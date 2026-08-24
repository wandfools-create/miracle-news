import { parseCandidateCategoryFilter } from "@/lib/collection-candidates/candidateCategory";
import {
  candidateListSearchParams,
  parseCandidateView,
} from "@/lib/collection-candidates/candidateListQuery";

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
      params.set(key, value);
    }
  }
  return `/admin/collection-candidates?${params.toString()}`;
}
