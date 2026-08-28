/** Max articles per bulk publish form submit (server-enforced). */
export const APPROVED_BULK_PUBLISH_MAX_IDS = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidArticleUuid(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export type ParsedApprovedPublishIds = {
  /** Unique valid UUIDs, capped at APPROVED_BULK_PUBLISH_MAX_IDS. */
  ids: string[];
  invalidCount: number;
  truncatedCount: number;
};

export function parseApprovedPublishArticleIds(
  formData: FormData
): ParsedApprovedPublishIds {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalidCount = 0;

  for (const raw of formData.getAll("articleIds")) {
    const id = String(raw).trim();
    if (!id) continue;
    if (!isValidArticleUuid(id)) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    valid.push(id);
  }

  let truncatedCount = 0;
  if (valid.length > APPROVED_BULK_PUBLISH_MAX_IDS) {
    truncatedCount = valid.length - APPROVED_BULK_PUBLISH_MAX_IDS;
    valid.length = APPROVED_BULK_PUBLISH_MAX_IDS;
  }

  return { ids: valid, invalidCount, truncatedCount };
}
