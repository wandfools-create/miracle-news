import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatPostgrestError,
  formatSupabaseThrownError,
} from "@/lib/supabase/serviceRole";
import type {
  ShortsPackageRepository,
  ShortsPackageRepoResult,
} from "@/lib/shorts/repository/types";
import { assertDraftEditable } from "@/lib/shorts/repository/types";
import {
  mapCreateInputToInsert,
  mapSupabaseRowToRecord,
  type ShortsPackageDbRow,
} from "@/lib/shorts/repository/supabaseMapping";

function safeAdminError(
  step: string,
  message: string,
  hint?: string
): ShortsPackageRepoResult<never> {
  const parts = [message];
  if (hint) parts.push(hint);
  return {
    ok: false,
    error: parts.join(" "),
    step,
  };
}

/** Production Supabase repository (service role, server-only). */
export function createSupabaseShortsPackageRepository(
  client: SupabaseClient
): ShortsPackageRepository {
  const table = "shorts_production_packages";

  return {
    async create(input) {
      try {
        const { data, error } = await client
          .from(table)
          .insert(mapCreateInputToInsert(input))
          .select("*")
          .single();

        if (error) {
          const formatted = formatPostgrestError("shorts_package_create", error);
          return safeAdminError(
            formatted.step,
            "제작 패키지 저장에 실패했습니다.",
            formatted.hint || formatted.error
          );
        }

        return { ok: true, data: mapSupabaseRowToRecord(data as ShortsPackageDbRow) };
      } catch (err) {
        const formatted = formatSupabaseThrownError("shorts_package_create", err);
        return safeAdminError(
          formatted.step,
          "제작 패키지 저장 중 오류가 발생했습니다.",
          formatted.hint
        );
      }
    },

    async getById(id) {
      try {
        const { data, error } = await client
          .from(table)
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (error) {
          const formatted = formatPostgrestError("shorts_package_get", error);
          return safeAdminError(
            formatted.step,
            "패키지를 조회하지 못했습니다.",
            formatted.hint || formatted.error
          );
        }

        if (!data) return { ok: true, data: null };
        return { ok: true, data: mapSupabaseRowToRecord(data as ShortsPackageDbRow) };
      } catch (err) {
        const formatted = formatSupabaseThrownError("shorts_package_get", err);
        return safeAdminError(
          formatted.step,
          "패키지 조회 중 오류가 발생했습니다.",
          formatted.hint
        );
      }
    },

    async listRecent(limit = 20) {
      try {
        const { data, error } = await client
          .from(table)
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(limit);

        if (error) {
          const formatted = formatPostgrestError("shorts_package_list", error);
          return safeAdminError(
            formatted.step,
            "최근 패키지 목록을 불러오지 못했습니다.",
            formatted.hint || formatted.error
          );
        }

        return {
          ok: true,
          data: (data ?? []).map((row) =>
            mapSupabaseRowToRecord(row as ShortsPackageDbRow)
          ),
        };
      } catch (err) {
        const formatted = formatSupabaseThrownError("shorts_package_list", err);
        return safeAdminError(
          formatted.step,
          "패키지 목록 조회 중 오류가 발생했습니다.",
          formatted.hint
        );
      }
    },

    async updateDraft(id, packageContent) {
      try {
        const current = await this.getById(id);
        if (!current.ok) return current;
        if (!current.data) {
          return {
            ok: false,
            error: "패키지를 찾을 수 없습니다.",
            step: "not_found",
          };
        }
        const editable = assertDraftEditable(current.data.status);
        if (!editable.ok) return editable;

        const { data, error } = await client
          .from(table)
          .update({
            package: packageContent,
            status: "draft",
            reviewed_at: null,
          })
          .eq("id", id)
          .eq("status", "draft")
          .select("*")
          .maybeSingle();

        if (error) {
          const formatted = formatPostgrestError("shorts_package_update", error);
          return safeAdminError(
            formatted.step,
            "초안 저장에 실패했습니다.",
            formatted.hint || formatted.error
          );
        }
        if (!data) {
          return {
            ok: false,
            error:
              "초안을 저장하지 못했습니다. 검토 완료 상태이거나 패키지가 없습니다.",
            step: "update_conflict",
          };
        }
        return { ok: true, data: mapSupabaseRowToRecord(data as ShortsPackageDbRow) };
      } catch (err) {
        const formatted = formatSupabaseThrownError("shorts_package_update", err);
        return safeAdminError(
          formatted.step,
          "초안 저장 중 오류가 발생했습니다.",
          formatted.hint
        );
      }
    },

    async markReviewed(id, packageContent) {
      try {
        const current = await this.getById(id);
        if (!current.ok) return current;
        if (!current.data) {
          return {
            ok: false,
            error: "패키지를 찾을 수 없습니다.",
            step: "not_found",
          };
        }
        const editable = assertDraftEditable(current.data.status);
        if (!editable.ok) return editable;

        const now = new Date().toISOString();
        const { data, error } = await client
          .from(table)
          .update({
            package: packageContent,
            status: "reviewed",
            reviewed_at: now,
          })
          .eq("id", id)
          .eq("status", "draft")
          .select("*")
          .maybeSingle();

        if (error) {
          const formatted = formatPostgrestError(
            "shorts_package_mark_reviewed",
            error
          );
          return safeAdminError(
            formatted.step,
            "검토 완료 저장에 실패했습니다.",
            formatted.hint || formatted.error
          );
        }
        if (!data) {
          return {
            ok: false,
            error: "검토 완료로 표시하지 못했습니다. 이미 검토되었거나 없습니다.",
            step: "update_conflict",
          };
        }
        return { ok: true, data: mapSupabaseRowToRecord(data as ShortsPackageDbRow) };
      } catch (err) {
        const formatted = formatSupabaseThrownError(
          "shorts_package_mark_reviewed",
          err
        );
        return safeAdminError(
          formatted.step,
          "검토 완료 저장 중 오류가 발생했습니다.",
          formatted.hint
        );
      }
    },

    async revertToDraft(id) {
      try {
        const current = await this.getById(id);
        if (!current.ok) return current;
        if (!current.data) {
          return {
            ok: false,
            error: "패키지를 찾을 수 없습니다.",
            step: "not_found",
          };
        }
        if (current.data.status !== "reviewed") {
          return {
            ok: false,
            error: "검토 완료 상태가 아니므로 되돌릴 수 없습니다.",
            step: "status",
          };
        }

        const { data, error } = await client
          .from(table)
          .update({
            status: "draft",
            reviewed_at: null,
          })
          .eq("id", id)
          .eq("status", "reviewed")
          .select("*")
          .maybeSingle();

        if (error) {
          const formatted = formatPostgrestError(
            "shorts_package_revert_draft",
            error
          );
          return safeAdminError(
            formatted.step,
            "초안으로 되돌리기에 실패했습니다.",
            formatted.hint || formatted.error
          );
        }
        if (!data) {
          return {
            ok: false,
            error: "초안으로 되돌리지 못했습니다.",
            step: "update_conflict",
          };
        }
        return { ok: true, data: mapSupabaseRowToRecord(data as ShortsPackageDbRow) };
      } catch (err) {
        const formatted = formatSupabaseThrownError(
          "shorts_package_revert_draft",
          err
        );
        return safeAdminError(
          formatted.step,
          "초안으로 되돌리기 중 오류가 발생했습니다.",
          formatted.hint
        );
      }
    },
  };
}

export {
  mapCreateInputToInsert,
  mapSupabaseRowToRecord,
  type ShortsPackageDbRow,
} from "@/lib/shorts/repository/supabaseMapping";
