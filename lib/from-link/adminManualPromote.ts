/**
 * Admin manual source body + force-create helpers for 「기사 만들기」.
 * No OpenAI. Flags stored in ai_review_notes (no migration).
 */

import {
  MIN_ADMIN_SOFT_SAVE_BODY_CHARS,
  type FromLinkDraftQualityResult,
} from "@/lib/from-link/validateArticleQuality";
import { normalizeSupplementalText } from "@/lib/from-link/supplementalText";

/** Soft floor for force+manual paste to pass extraction gates (not empty junk). */
export const MIN_ADMIN_FORCE_MANUAL_CHARS = 50;

export const MANUAL_SOURCE_BODY_NOTE = "관리자 수동 원문 사용";
export const ADMIN_FORCE_CREATE_NOTE = "관리자 강제 기사화";
export const MANUAL_SOURCE_BODY_FLAG = "manual_source_body_used=true";
export const ADMIN_FORCE_CREATE_FLAG = "admin_force_create=true";

/** Force soft-save: length/thin/summary only — never ads/boilerplate/empty. */
const ADMIN_FORCE_SOFT_FAIL_IDS = new Set([
  "body_ko_length",
  "body_thin_facts",
  "summary_body_similarity",
]);

export function parseAdminForceCreateFlag(
  raw: string | boolean | null | undefined
): boolean {
  if (raw === true) return true;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function notesIndicateManualSourceBody(notes: string | null | undefined): boolean {
  const n = notes ?? "";
  return (
    n.includes(MANUAL_SOURCE_BODY_NOTE) || n.includes(MANUAL_SOURCE_BODY_FLAG)
  );
}

export function notesIndicateAdminForceCreate(
  notes: string | null | undefined
): boolean {
  const n = notes ?? "";
  return (
    n.includes(ADMIN_FORCE_CREATE_NOTE) || n.includes(ADMIN_FORCE_CREATE_FLAG)
  );
}

export function buildManualPromoteNoteLines(input: {
  manualSourceBodyUsed: boolean;
  adminForceCreate: boolean;
  manualBodyChars?: number;
}): string[] {
  const lines: string[] = [];
  if (input.manualSourceBodyUsed) {
    lines.push(`[flag] ${MANUAL_SOURCE_BODY_FLAG}`);
    lines.push(MANUAL_SOURCE_BODY_NOTE);
    if (typeof input.manualBodyChars === "number") {
      lines.push(`[수동 원문] ${input.manualBodyChars}자`);
    }
  }
  if (input.adminForceCreate) {
    lines.push(`[flag] ${ADMIN_FORCE_CREATE_FLAG}`);
    lines.push(ADMIN_FORCE_CREATE_NOTE);
    lines.push("[경고] 길이·문단 기준을 관리자가 우회함 · 사실 창작 없음");
  }
  return lines;
}

/**
 * Force create may soft-save when generated body is non-empty and failures
 * are only length/thin/summary similarity (promo/boilerplate/empty still hard-fail).
 */
export function canAllowAdminForceCreateSave(
  result: Extract<FromLinkDraftQualityResult, { ok: false }>,
  bodyKo: string
): boolean {
  const body = bodyKo.trim();
  if (body.length < MIN_ADMIN_SOFT_SAVE_BODY_CHARS) return false;
  const failed = result.failedCheckIds ?? [];
  if (failed.length === 0) return false;
  return failed.every((id) => ADMIN_FORCE_SOFT_FAIL_IDS.has(id));
}

/**
 * Manual paste is enough to clear extraction gates when force is on
 * (or when paste alone meets the normal 400-char supplemental floor).
 */
export function manualBodyClearsExtractionGate(input: {
  manualBodyChars: number;
  adminForceCreate: boolean;
  minUsableChars: number;
}): boolean {
  if (input.manualBodyChars <= 0) return false;
  if (input.manualBodyChars >= input.minUsableChars) return true;
  return (
    input.adminForceCreate &&
    input.manualBodyChars >= MIN_ADMIN_FORCE_MANUAL_CHARS
  );
}

export function formatManualPrimaryMaterialBlock(text: string): string {
  return [
    "[관리자 수동 원문 — 자동 추출보다 우선하는 본문 근거. 없는 사실 추가 금지]",
    text,
  ].join("\n");
}

export function readManualBodyFromFormData(formData: FormData): string | null {
  return normalizeSupplementalText(
    String(formData.get("manualSourceBody") ?? formData.get("supplementalText") ?? "")
  );
}

export function readAdminForceCreateFromFormData(formData: FormData): boolean {
  return parseAdminForceCreateFlag(
    String(formData.get("adminForceCreate") ?? "")
  );
}
