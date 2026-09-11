import { after } from "next/server";

/**
 * Schedule one News Wire title-localize batch after the response.
 * Safe to call once per collect request from a Next.js route/cron boundary.
 * Never throws to the caller — collect / run status must stay unchanged.
 *
 * Runs even when this collect inserted 0 rows so prior backlog can drain.
 * If after() is cancelled by maxDuration, the same unready rows remain
 * and the next collect will retry.
 */
export function scheduleWireTitleLocalizeAfterResponse(): void {
  try {
    after(async () => {
      try {
        const { localizeWireCandidateTitles } = await import(
          "@/lib/news-wire/localizeWireTitles"
        );
        const result = await localizeWireCandidateTitles({ limit: 40 });
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
  } catch (err) {
    console.warn("[news-wire] after() schedule skipped; collect unchanged", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
