/** Max pasted supplemental source text (chars). */
export const MAX_SUPPLEMENTAL_TEXT_CHARS = 30_000;

export function normalizeSupplementalText(
  raw: string | null | undefined
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_SUPPLEMENTAL_TEXT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_SUPPLEMENTAL_TEXT_CHARS);
}

export function formatSupplementalMaterialBlock(text: string): string {
  return [
    "[사용자가 붙여넣은 원문 보강 텍스트 — 링크 추출분과 함께 근거로 사용]",
    text,
  ].join("\n");
}
