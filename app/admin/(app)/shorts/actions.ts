"use server";

import { revalidatePath } from "next/cache";

import { dedupeShortsArticleSelection } from "@/lib/shorts/dedupeShortsArticleSelection";
import {
  parseShortsArticleIds,
  validateShortsSelectionInput,
} from "@/lib/shorts/fetchPublishedArticlesForShorts";
import { generateShortsProductionPackage } from "@/lib/shorts/generateShortsPackage";
import { loadPublishedArticlesByIds } from "@/lib/shorts/loadPublishedArticlesForShorts";
import { parseShortsProductionPackageJson } from "@/lib/shorts/parseShortsPackageJson";
import { requireShortsAdmin } from "@/lib/shorts/requireShortsAdmin";
import { resolveShortsPackageRepository } from "@/lib/shorts/repository/resolveShortsPackageRepository";
import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";
import type { ShortsProductionPackageContent } from "@/lib/shorts/shortsPackageTypes";

export type ShortsPackageActionFailure = {
  ok: false;
  error: string;
  step?: string;
  removedDuplicates?: Array<{ id: string; reason: string; duplicateOf: string }>;
};

export type GenerateShortsPackageActionResult =
  | {
      ok: true;
      packageId: string;
      removedDuplicates: Array<{ id: string; reason: string; duplicateOf: string }>;
    }
  | ShortsPackageActionFailure;

export type SaveShortsPackageActionResult =
  | { ok: true; packageId: string }
  | ShortsPackageActionFailure;

function parseDesk(raw: FormDataEntryValue | null): ShortsDesk | null {
  const value = String(raw ?? "").trim();
  if (value === "morning" || value === "evening") return value;
  return null;
}

function parsePackageJson(raw: FormDataEntryValue | null):
  | { ok: true; package: ShortsProductionPackageContent }
  | { ok: false; error: string; step: string } {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { ok: false, error: "패키지 JSON이 비어 있습니다.", step: "validation" };
  }
  try {
    const data = JSON.parse(text) as unknown;
    const parsed = parseShortsProductionPackageJson(data);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, step: "json_validation" };
    }
    return { ok: true, package: parsed.package };
  } catch {
    return {
      ok: false,
      error: "패키지 JSON 파싱에 실패했습니다. 형식을 확인하세요.",
      step: "validation",
    };
  }
}

export async function generateShortsPackageAction(
  formData: FormData
): Promise<GenerateShortsPackageActionResult> {
  const admin = await requireShortsAdmin();
  if (!admin.ok) {
    return { ok: false, error: admin.error, step: admin.step };
  }

  const repoResult = resolveShortsPackageRepository();
  if (!repoResult.ok) {
    return { ok: false, error: repoResult.error, step: repoResult.step };
  }
  const repo = repoResult.data;

  const articleIds = parseShortsArticleIds(formData.get("articleIds"));
  const desk = parseDesk(formData.get("desk"));
  const editDate = String(formData.get("editDate") ?? "").trim();

  if (!articleIds || !desk) {
    return {
      ok: false,
      error: "기사 ID, 회차, 날짜가 필요합니다.",
      step: "validation",
    };
  }

  const inputCheck = validateShortsSelectionInput({ articleIds, desk, editDate });
  if (!inputCheck.ok) {
    return { ok: false, error: inputCheck.error, step: inputCheck.step };
  }

  const loaded = await loadPublishedArticlesByIds(articleIds);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error, step: loaded.step };
  }

  const ordered = articleIds
    .map((id) => loaded.articles.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const deduped = dedupeShortsArticleSelection(ordered);
  if (deduped.kept.length < 3) {
    return {
      ok: false,
      error:
        "SAME EVENT 중복 제거 후 기사가 3개 미만입니다. 다른 각도의 기사를 추가하세요.",
      step: "same_event_dedup",
      removedDuplicates: deduped.removed,
    };
  }

  const generated = await generateShortsProductionPackage({
    desk,
    editDate,
    articles: deduped.kept,
  });

  // Do not persist an empty/partial package on generation failure.
  if (!generated.ok) {
    return { ok: false, error: generated.error, step: generated.step };
  }

  const created = await repo.create({
    desk,
    editDate,
    articleIds: deduped.kept.map((a) => a.id),
    package: generated.package,
    generationMode: generated.generationMode,
    createdBy: admin.email,
  });

  if (!created.ok) {
    return { ok: false, error: created.error, step: created.step };
  }

  revalidatePath("/admin/shorts");
  revalidatePath(`/admin/shorts/packages/${created.data.id}`);

  return {
    ok: true,
    packageId: created.data.id,
    removedDuplicates: deduped.removed,
  };
}

export async function saveShortsPackageDraftAction(
  formData: FormData
): Promise<SaveShortsPackageActionResult> {
  const admin = await requireShortsAdmin();
  if (!admin.ok) {
    return { ok: false, error: admin.error, step: admin.step };
  }

  const repoResult = resolveShortsPackageRepository();
  if (!repoResult.ok) {
    return { ok: false, error: repoResult.error, step: repoResult.step };
  }

  const packageId = String(formData.get("packageId") ?? "").trim();
  if (!packageId) {
    return { ok: false, error: "패키지 ID가 없습니다.", step: "validation" };
  }

  const parsed = parsePackageJson(formData.get("packageJson"));
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, step: parsed.step };
  }

  const updated = await repoResult.data.updateDraft(packageId, parsed.package);
  if (!updated.ok) {
    return { ok: false, error: updated.error, step: updated.step };
  }

  revalidatePath("/admin/shorts");
  revalidatePath(`/admin/shorts/packages/${packageId}`);

  return { ok: true, packageId };
}

export async function markShortsPackageReviewedAction(
  formData: FormData
): Promise<SaveShortsPackageActionResult> {
  const admin = await requireShortsAdmin();
  if (!admin.ok) {
    return { ok: false, error: admin.error, step: admin.step };
  }

  const repoResult = resolveShortsPackageRepository();
  if (!repoResult.ok) {
    return { ok: false, error: repoResult.error, step: repoResult.step };
  }

  const packageId = String(formData.get("packageId") ?? "").trim();
  if (!packageId) {
    return { ok: false, error: "패키지 ID가 없습니다.", step: "validation" };
  }

  const parsed = parsePackageJson(formData.get("packageJson"));
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, step: parsed.step };
  }

  const updated = await repoResult.data.markReviewed(packageId, parsed.package);
  if (!updated.ok) {
    return { ok: false, error: updated.error, step: updated.step };
  }

  revalidatePath("/admin/shorts");
  revalidatePath(`/admin/shorts/packages/${packageId}`);

  return { ok: true, packageId };
}

export async function revertShortsPackageToDraftAction(
  formData: FormData
): Promise<SaveShortsPackageActionResult> {
  const admin = await requireShortsAdmin();
  if (!admin.ok) {
    return { ok: false, error: admin.error, step: admin.step };
  }

  const repoResult = resolveShortsPackageRepository();
  if (!repoResult.ok) {
    return { ok: false, error: repoResult.error, step: repoResult.step };
  }

  const packageId = String(formData.get("packageId") ?? "").trim();
  if (!packageId) {
    return { ok: false, error: "패키지 ID가 없습니다.", step: "validation" };
  }

  const updated = await repoResult.data.revertToDraft(packageId);
  if (!updated.ok) {
    return { ok: false, error: updated.error, step: updated.step };
  }

  revalidatePath("/admin/shorts");
  revalidatePath(`/admin/shorts/packages/${packageId}`);

  return { ok: true, packageId };
}
