import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { shortsPackageStoreDir } from "@/lib/shorts/shortsPackageEnv";
import type {
  CreateShortsPackageInput,
  ShortsPackageRepository,
  ShortsPackageRepoResult,
} from "@/lib/shorts/repository/types";
import { assertDraftEditable } from "@/lib/shorts/repository/types";
import type {
  ShortsProductionPackageContent,
  ShortsProductionPackageRecord,
} from "@/lib/shorts/shortsPackageTypes";

function packagePath(id: string, root: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
  return path.join(root, `${safeId}.json`);
}

function parseRecord(raw: string): ShortsProductionPackageRecord | null {
  try {
    const parsed = JSON.parse(raw) as ShortsProductionPackageRecord;
    if (!parsed?.id || !parsed.package) return null;
    return {
      ...parsed,
      reviewedAt: parsed.reviewedAt ?? null,
    };
  } catch {
    return null;
  }
}

/** Local/dev/test file repository — never use as Production silent fallback. */
export function createFileShortsPackageRepository(
  root?: string
): ShortsPackageRepository {
  const resolveRoot = () => root ?? shortsPackageStoreDir();

  async function ensureDir(): Promise<string> {
    const dir = resolveRoot();
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async function write(
    record: ShortsProductionPackageRecord
  ): Promise<void> {
    const dir = await ensureDir();
    await writeFile(
      packagePath(record.id, dir),
      JSON.stringify(record, null, 2),
      "utf8"
    );
  }

  async function read(
    id: string
  ): Promise<ShortsProductionPackageRecord | null> {
    try {
      const raw = await readFile(packagePath(id, resolveRoot()), "utf8");
      return parseRecord(raw);
    } catch {
      return null;
    }
  }

  return {
    async create(
      input: CreateShortsPackageInput
    ): Promise<ShortsPackageRepoResult<ShortsProductionPackageRecord>> {
      const now = new Date().toISOString();
      const record: ShortsProductionPackageRecord = {
        id: crypto.randomUUID(),
        desk: input.desk,
        editDate: input.editDate,
        articleIds: input.articleIds,
        status: "draft",
        package: input.package,
        generationMode: input.generationMode,
        createdBy: input.createdBy,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
      };
      await write(record);
      return { ok: true, data: record };
    },

    async getById(id) {
      return { ok: true, data: await read(id) };
    },

    async listRecent(limit = 20) {
      const dir = await ensureDir();
      try {
        const files = await readdir(dir);
        const records: ShortsProductionPackageRecord[] = [];
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const raw = await readFile(path.join(dir, file), "utf8");
          const record = parseRecord(raw);
          if (record) records.push(record);
        }
        records.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        return { ok: true, data: records.slice(0, limit) };
      } catch {
        return { ok: true, data: [] };
      }
    },

    async updateDraft(id, packageContent) {
      const existing = await read(id);
      if (!existing) {
        return {
          ok: false,
          error: "패키지를 찾을 수 없습니다.",
          step: "not_found",
        };
      }
      const editable = assertDraftEditable(existing.status);
      if (!editable.ok) return editable;

      const updated: ShortsProductionPackageRecord = {
        ...existing,
        package: packageContent,
        status: "draft",
        reviewedAt: null,
        updatedAt: new Date().toISOString(),
      };
      await write(updated);
      return { ok: true, data: updated };
    },

    async markReviewed(id, packageContent) {
      const existing = await read(id);
      if (!existing) {
        return {
          ok: false,
          error: "패키지를 찾을 수 없습니다.",
          step: "not_found",
        };
      }
      const editable = assertDraftEditable(existing.status);
      if (!editable.ok) return editable;

      const now = new Date().toISOString();
      const updated: ShortsProductionPackageRecord = {
        ...existing,
        package: packageContent,
        status: "reviewed",
        reviewedAt: now,
        updatedAt: now,
      };
      await write(updated);
      return { ok: true, data: updated };
    },

    async revertToDraft(id) {
      const existing = await read(id);
      if (!existing) {
        return {
          ok: false,
          error: "패키지를 찾을 수 없습니다.",
          step: "not_found",
        };
      }
      if (existing.status !== "reviewed") {
        return {
          ok: false,
          error: "검토 완료 상태가 아니므로 되돌릴 수 없습니다.",
          step: "status",
        };
      }
      const updated: ShortsProductionPackageRecord = {
        ...existing,
        status: "draft",
        reviewedAt: null,
        updatedAt: new Date().toISOString(),
      };
      await write(updated);
      return { ok: true, data: updated };
    },
  };
}

/** In-memory repository for unit tests (no disk). */
export function createMemoryShortsPackageRepository(): ShortsPackageRepository {
  const map = new Map<string, ShortsProductionPackageRecord>();

  return {
    async create(input) {
      const now = new Date().toISOString();
      const record: ShortsProductionPackageRecord = {
        id: crypto.randomUUID(),
        desk: input.desk,
        editDate: input.editDate,
        articleIds: input.articleIds,
        status: "draft",
        package: input.package,
        generationMode: input.generationMode,
        createdBy: input.createdBy,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
      };
      map.set(record.id, record);
      return { ok: true, data: record };
    },
    async getById(id) {
      return { ok: true, data: map.get(id) ?? null };
    },
    async listRecent(limit = 20) {
      const records = [...map.values()].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      return { ok: true, data: records.slice(0, limit) };
    },
    async updateDraft(id, packageContent: ShortsProductionPackageContent) {
      const existing = map.get(id);
      if (!existing) {
        return {
          ok: false,
          error: "패키지를 찾을 수 없습니다.",
          step: "not_found",
        };
      }
      const editable = assertDraftEditable(existing.status);
      if (!editable.ok) return editable;
      const updated = {
        ...existing,
        package: packageContent,
        status: "draft" as const,
        reviewedAt: null,
        updatedAt: new Date().toISOString(),
      };
      map.set(id, updated);
      return { ok: true, data: updated };
    },
    async markReviewed(id, packageContent) {
      const existing = map.get(id);
      if (!existing) {
        return {
          ok: false,
          error: "패키지를 찾을 수 없습니다.",
          step: "not_found",
        };
      }
      const editable = assertDraftEditable(existing.status);
      if (!editable.ok) return editable;
      const now = new Date().toISOString();
      const updated = {
        ...existing,
        package: packageContent,
        status: "reviewed" as const,
        reviewedAt: now,
        updatedAt: now,
      };
      map.set(id, updated);
      return { ok: true, data: updated };
    },
    async revertToDraft(id) {
      const existing = map.get(id);
      if (!existing) {
        return {
          ok: false,
          error: "패키지를 찾을 수 없습니다.",
          step: "not_found",
        };
      }
      if (existing.status !== "reviewed") {
        return {
          ok: false,
          error: "검토 완료 상태가 아니므로 되돌릴 수 없습니다.",
          step: "status",
        };
      }
      const updated = {
        ...existing,
        status: "draft" as const,
        reviewedAt: null,
        updatedAt: new Date().toISOString(),
      };
      map.set(id, updated);
      return { ok: true, data: updated };
    },
  };
}
