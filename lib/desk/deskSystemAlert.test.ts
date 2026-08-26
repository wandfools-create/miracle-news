import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyzeDeskSystemAlert,
  formatDeskSystemAlertMessage,
} from "@/lib/desk/analyzeDeskSystemAlert";
import type { DeskRunAlertInput } from "@/lib/desk/deskAlertTypes";
import { maybeSendDeskSystemAlertCore } from "@/lib/desk/sendDeskSystemAlertCore";
import { getDiscordSystemAlertsChannelId } from "@/lib/discord/systemAlertsChannel";
import type { FeedCollectStats } from "@/lib/rss/collectRssToReviewQueue";

const FIXED_NOW = new Date("2026-08-25T20:00:00.000Z");

function feed(
  partial: Partial<FeedCollectStats> &
    Pick<FeedCollectStats, "sourceKey" | "label">
): FeedCollectStats {
  return {
    feedUrl: partial.feedUrl ?? "https://example.com/rss",
    checked: partial.checked ?? 0,
    inserted: partial.inserted ?? 0,
    wouldInsert: partial.wouldInsert ?? 0,
    duplicates: partial.duplicates ?? 0,
    skipped: partial.skipped ?? 0,
    skippedOld: partial.skippedOld ?? 0,
    failed: partial.failed ?? 0,
    error: partial.error,
    ...partial,
  };
}

function baseInput(
  overrides: Partial<DeskRunAlertInput> = {}
): DeskRunAlertInput {
  return {
    region: "korea",
    dryRun: false,
    collect: {
      ok: true,
      region: "korea",
      save: true,
      testMode: false,
      dryRun: false,
      totals: { inserted: 5, failed: 0 },
      feeds: [
        feed({
          sourceKey: "chosun",
          label: "Chosun",
          checked: 10,
          inserted: 3,
        }),
        feed({
          sourceKey: "tvchosun",
          label: "TV Chosun",
          checked: 8,
          inserted: 2,
        }),
      ],
    },
    recommend: { ok: true, queued: 0, updated: 0, openaiCalls: 0 },
    discord: {
      ok: true,
      sent: 2,
      skipped: 0,
      dryRun: false,
      errors: [],
      briefEligibleCount: 2,
    },
    ...overrides,
  };
}

describe("desk system alerts (fixture only, no RSS/OpenAI/Discord/DB)", () => {
  it("1. fully healthy run → system alert 0", () => {
    assert.equal(analyzeDeskSystemAlert(baseInput(), FIXED_NOW), null);
  });

  it("2. partial source failure → WARNING 1", () => {
    const alert = analyzeDeskSystemAlert(
      baseInput({
        collect: {
          ok: true,
          region: "korea",
          save: true,
          testMode: false,
          dryRun: false,
          totals: { inserted: 4, failed: 0 },
          feeds: [
            feed({
              sourceKey: "tvchosun",
              label: "TV Chosun",
              error: "HTTP 503",
            }),
            feed({
              sourceKey: "chosun",
              label: "Chosun",
              checked: 12,
              inserted: 4,
            }),
            feed({
              sourceKey: "yonhap-kr-radar",
              label: "Yonhap Breaking",
              checked: 6,
              inserted: 0,
            }),
          ],
        },
      }),
      FIXED_NOW
    );

    assert.ok(alert);
    assert.equal(alert.level, "warning");
    const msg = formatDeskSystemAlertMessage(alert);
    assert.match(msg, /⚠️ Miracle News Desk WARNING/);
    assert.match(msg, /Problems:/);
    assert.match(msg, /TV Chosun fetch failed/);
    assert.match(msg, /Failed sources: 1/);
    assert.equal(alert.sourceStatuses.some((s) => s.includes("Yonhap Breaking")), true);
  });

  it("3. new candidates 0 → WARNING 1", () => {
    const alert = analyzeDeskSystemAlert(
      baseInput({
        collect: {
          ok: true,
          region: "korea",
          save: true,
          testMode: false,
          dryRun: false,
          totals: { inserted: 0, failed: 0 },
          feeds: [
            feed({
              sourceKey: "chosun",
              label: "Chosun",
              checked: 15,
              inserted: 0,
            }),
            feed({
              sourceKey: "tvchosun",
              label: "TV Chosun",
              checked: 10,
              inserted: 0,
            }),
          ],
        },
      }),
      FIXED_NOW
    );

    assert.ok(alert);
    assert.equal(alert.level, "warning");
    assert.match(formatDeskSystemAlertMessage(alert), /New candidates: 0/);
  });

  it("4. AI exception → ERROR 1", () => {
    const alert = analyzeDeskSystemAlert(
      baseInput({
        recommend: {
          ok: false,
          error: "OpenAI rate limit exceeded",
          step: "openai_batch",
          openaiCalls: 1,
        },
      }),
      FIXED_NOW
    );

    assert.ok(alert);
    assert.equal(alert.level, "error");
    assert.match(
      formatDeskSystemAlertMessage(alert),
      /🚨 Miracle News Desk ERROR/
    );
    assert.match(formatDeskSystemAlertMessage(alert), /AI recommendation failed/);
  });

  it("5. Discord Brief failure → ERROR 1", () => {
    const alert = analyzeDeskSystemAlert(
      baseInput({
        discord: {
          ok: false,
          sent: 0,
          skipped: 0,
          dryRun: false,
          errors: ["send:abc:discord_http_500"],
          briefEligibleCount: 2,
        },
      }),
      FIXED_NOW
    );

    assert.ok(alert);
    assert.equal(alert.level, "error");
    assert.match(
      formatDeskSystemAlertMessage(alert),
      /Discord brief send failed/
    );
  });

  it("6. multiple WARNINGs → single Discord alert 1", () => {
    const alert = analyzeDeskSystemAlert(
      baseInput({
        collect: {
          ok: true,
          region: "us-intl",
          save: true,
          testMode: false,
          dryRun: false,
          totals: { inserted: 0, failed: 1 },
          feeds: [
            feed({
              sourceKey: "sciencedaily",
              label: "ScienceDaily",
              error: "timeout",
            }),
            feed({
              sourceKey: "ap",
              label: "AP",
              checked: 8,
              inserted: 0,
              failed: 1,
            }),
          ],
        },
      }),
      FIXED_NOW
    );

    assert.ok(alert);
    assert.equal(alert.level, "warning");
    const msg = formatDeskSystemAlertMessage(alert);
    assert.match(msg, /ScienceDaily fetch failed/);
    assert.match(msg, /New candidates: 0/);
    assert.equal((msg.match(/⚠️/g) ?? []).length, 1);
    assert.equal((msg.match(/🚨/g) ?? []).length, 0);
  });

  it("7. WARNING + ERROR together → ERROR alert 1", () => {
    const alert = analyzeDeskSystemAlert(
      baseInput({
        collect: {
          ok: true,
          region: "korea",
          save: true,
          testMode: false,
          dryRun: false,
          totals: { inserted: 2, failed: 0 },
          feeds: [
            feed({
              sourceKey: "tvchosun",
              label: "TV Chosun",
              error: "timeout",
            }),
            feed({
              sourceKey: "chosun",
              label: "Chosun",
              checked: 5,
              inserted: 2,
            }),
          ],
        },
        recommend: {
          ok: false,
          error: "openai down",
          step: "openai",
          openaiCalls: 0,
        },
      }),
      FIXED_NOW
    );

    assert.ok(alert);
    assert.equal(alert.level, "error");
    const msg = formatDeskSystemAlertMessage(alert);
    assert.match(msg, /TV Chosun fetch failed/);
    assert.match(msg, /AI recommendation failed/);
    assert.equal((msg.match(/🚨/g) ?? []).length, 1);
    assert.equal((msg.match(/⚠️/g) ?? []).length, 0);
  });

  it("8. system alert send failure does not break desk result", async () => {
    const result = await maybeSendDeskSystemAlertCore(
      baseInput({
        recommend: {
          ok: false,
          error: "boom",
          step: "openai",
          openaiCalls: 0,
        },
      }),
      {
        now: FIXED_NOW,
        discordEnv: {
          botToken: "bot-token",
          morningBriefChannelId: "brief-channel",
        },
        resolveAlertsChannelId: () => "alerts-channel",
        sendMessage: async () => ({ ok: false, error: "service unavailable" }),
      }
    );

    assert.equal(result.sent, false);
    if (!result.sent && result.reason === "send_failed") {
      assert.match(result.error, /unavailable|503/);
    } else {
      assert.fail("expected send_failed");
    }
  });

  it("9. US label exact", () => {
    const us = analyzeDeskSystemAlert(
      baseInput({
        region: "us-intl",
        collect: {
          ok: false,
          error: "collect crashed",
          region: "us-intl",
        },
      }),
      FIXED_NOW
    );
    assert.match(
      formatDeskSystemAlertMessage(us!),
      /Desk: US \/ International Desk/
    );
  });

  it("10. Korea label exact", () => {
    const kr = analyzeDeskSystemAlert(
      baseInput({
        region: "korea",
        collect: {
          ok: false,
          error: "collect crashed",
          region: "korea",
        },
      }),
      FIXED_NOW
    );
    assert.match(formatDeskSystemAlertMessage(kr!), /Desk: Korea Desk/);
  });

  it("11. system alerts channel env missing → morning brief fallback", () => {
    const prev = process.env.DISCORD_SYSTEM_ALERTS_CHANNEL_ID;
    delete process.env.DISCORD_SYSTEM_ALERTS_CHANNEL_ID;
    assert.equal(getDiscordSystemAlertsChannelId("brief-123"), "brief-123");

    process.env.DISCORD_SYSTEM_ALERTS_CHANNEL_ID = "alerts-456";
    assert.equal(getDiscordSystemAlertsChannelId("brief-123"), "alerts-456");

    if (prev === undefined) delete process.env.DISCORD_SYSTEM_ALERTS_CHANNEL_ID;
    else process.env.DISCORD_SYSTEM_ALERTS_CHANNEL_ID = prev;
  });

  it("12. healthy with BEST/priority 0 → no alert", () => {
    assert.equal(
      analyzeDeskSystemAlert(
        baseInput({
          recommend: { ok: true, queued: 0, updated: 0, openaiCalls: 0 },
          discord: {
            ok: true,
            sent: 0,
            skipped: 0,
            dryRun: false,
            errors: [],
            briefEligibleCount: 0,
          },
        }),
        FIXED_NOW
      ),
      null
    );
  });

  it("all sources failed → ERROR", () => {
    const alert = analyzeDeskSystemAlert(
      baseInput({
        collect: {
          ok: true,
          region: "korea",
          save: true,
          testMode: false,
          dryRun: false,
          totals: { inserted: 0, failed: 0 },
          feeds: [
            feed({ sourceKey: "tvchosun", label: "TV Chosun", error: "down" }),
            feed({ sourceKey: "chosun", label: "Chosun", error: "down" }),
          ],
        },
      }),
      FIXED_NOW
    );

    assert.ok(alert);
    assert.equal(alert.level, "error");
  });

  it("dry-run skips alerts", () => {
    assert.equal(
      analyzeDeskSystemAlert(
        baseInput({
          dryRun: true,
          recommend: { ok: false, error: "x", openaiCalls: 0 },
        }),
        FIXED_NOW
      ),
      null
    );
  });

  it("sanitize strips secrets from Discord message", () => {
    const msg = formatDeskSystemAlertMessage(
      analyzeDeskSystemAlert(
        baseInput({
          recommend: {
            ok: false,
            error: "Bearer sk-secret1234567890 failed\n    at Object.call",
            step: "openai",
            openaiCalls: 1,
          },
        }),
        FIXED_NOW
      )!
    );
    assert.doesNotMatch(msg, /sk-secret/);
    assert.doesNotMatch(msg, /Bearer/);
  });

  it("preserves SAME EVENT dual-guard modules (source scan)", () => {
    const sameEvent = readFileSync(
      join(process.cwd(), "lib/same-event/classifySameEvent.ts"),
      "utf8"
    );
    const collect = readFileSync(
      join(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
      "utf8"
    );
    const publish = readFileSync(
      join(process.cwd(), "lib/articles/publishArticle.ts"),
      "utf8"
    );
    const promote = readFileSync(
      join(process.cwd(), "lib/collection-candidates/promoteCollectionCandidate.ts"),
      "utf8"
    );

    assert.match(sameEvent, /classifySameEvent/);
    assert.match(sameEvent, /different_angle/);
    assert.match(sameEvent, /update/);
    assert.match(collect, /decideCollectSameEvent/);
    assert.match(publish, /same_event_guard|allowSameEventOverride/);
    assert.match(promote, /same_event_published/);
  });
});
