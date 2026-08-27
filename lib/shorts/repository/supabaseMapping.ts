import type {
  CreateShortsPackageInput,
} from "@/lib/shorts/repository/types";
import type {
  ShortsGenerationMode,
  ShortsPackageStatus,
  ShortsProductionPackageContent,
  ShortsProductionPackageRecord,
} from "@/lib/shorts/shortsPackageTypes";
import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";

export type ShortsPackageDbRow = {
  id: string;
  desk: string;
  edit_date: string;
  article_ids: string[];
  status: string;
  package: ShortsProductionPackageContent;
  generation_mode: string;
  created_by: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export function mapSupabaseRowToRecord(
  row: ShortsPackageDbRow
): ShortsProductionPackageRecord {
  return {
    id: row.id,
    desk: row.desk as ShortsDesk,
    editDate:
      typeof row.edit_date === "string"
        ? row.edit_date.slice(0, 10)
        : String(row.edit_date),
    articleIds: row.article_ids ?? [],
    status: row.status as ShortsPackageStatus,
    package: row.package,
    generationMode: row.generation_mode as ShortsGenerationMode,
    createdBy: row.created_by,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at ?? null,
  };
}

export function mapCreateInputToInsert(input: CreateShortsPackageInput): {
  desk: string;
  edit_date: string;
  article_ids: string[];
  status: string;
  package: ShortsProductionPackageContent;
  generation_mode: string;
  created_by: string | null;
  reviewed_at: null;
} {
  return {
    desk: input.desk,
    edit_date: input.editDate,
    article_ids: input.articleIds,
    status: "draft",
    package: input.package,
    generation_mode: input.generationMode,
    created_by: input.createdBy,
    reviewed_at: null,
  };
}
