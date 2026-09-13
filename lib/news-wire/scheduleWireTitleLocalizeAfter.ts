import { after } from "next/server";

export const WIRE_TITLE_LOCALIZE_BATCH_LIMIT = 40;

/**
 * Schedule one News Wire title-localize batch after the response.
 * Returns whether after() registration succeeded (not whether translate finished).
 *
 * Never throws to the caller — collect / run status must stay unchanged.
 * Runs even when this collect inserted 0 rows so prior backlog can drain.
 */
export function scheduleWireTitleLocalizeAfterResponse(): boolean {
  try {
    after(async () => {
      try {
        const { localizeWireCandidateTitles } = await import(
          "@/lib/news-wire/localizeWireTitles"
        );
        const result = await localizeWireCandidateTitles({
          limit: WIRE_TITLE_LOCALIZE_BATCH_LIMIT,
        });
        console.info("[news-wire] localize after response", result);
      } catch (err) {
        console.warn(
          "[news-wire] localize after response failed; collect unchanged",
          {
            error: err instanceof Error ? err.message : String(err),
          }
        );
      }
    });
    return true;
  } catch (err) {
    console.warn("[news-wire] after() schedule skipped; collect unchanged", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
