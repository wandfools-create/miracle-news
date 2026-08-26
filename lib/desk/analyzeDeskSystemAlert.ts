import { formatDeskAlertTimeEt } from "@/lib/desk/formatDeskAlertTimeEt";
import { deskLabelForRegion } from "@/lib/desk/deskLabels";
import { sanitizeDeskAlertError } from "@/lib/desk/sanitizeDeskAlertError";
import type {
  DeskAlertLevel,
  DeskRunAlertInput,
  DeskSystemAlert,
  DeskStepCollectSnapshot,
} from "@/lib/desk/deskAlertTypes";

function isCollectSuccess(
  collect: DeskStepCollectSnapshot
): collect is Extract<DeskStepCollectSnapshot, { feeds: unknown }> {
  return "feeds" in collect;
}

function maxLevel(a: DeskAlertLevel, b: DeskAlertLevel): DeskAlertLevel {
  return a === "error" || b === "error" ? "error" : "warning";
}

/**
 * Build one summary alert for a desk run, or null when everything is normal.
 * Pure function — no Discord / DB / network.
 */
export function analyzeDeskSystemAlert(
  input: DeskRunAlertInput,
  now: Date = new Date()
): DeskSystemAlert | null {
  if (input.dryRun) return null;

  let level: DeskAlertLevel | null = null;
  let primaryStage = "Desk Run";
  const problems: string[] = [];
  const sourceStatuses: string[] = [];
  const resultLines: string[] = [];

  const { collect, recommend, discord } = input;

  // --- RSS collect ---
  if (!isCollectSuccess(collect)) {
    level = "error";
    primaryStage = "RSS Collection";
    problems.push(
      `Desk collect failed: ${sanitizeDeskAlertError(collect.error)}`
    );
  } else if (!collect.testMode) {
    const feeds = collect.feeds;
    const failedFeeds = feeds.filter((f) => f.error);
    const okFeeds = feeds.filter((f) => !f.error);
    const fetchedAny = okFeeds.some((f) => f.checked > 0);
    const insertFailed = feeds.reduce((n, f) => n + f.failed, 0);
    const checked = feeds.reduce((n, f) => n + f.checked, 0);

    for (const feed of feeds) {
      if (feed.error) {
        sourceStatuses.push(`${feed.label}: fetch failed`);
        problems.push(
          `${feed.label} fetch failed (${sanitizeDeskAlertError(feed.error, 60)})`
        );
      } else {
        sourceStatuses.push(`${feed.label}: OK`);
      }
    }

    if (feeds.length > 0 && failedFeeds.length === feeds.length) {
      level = maxLevel(level ?? "warning", "error");
      primaryStage = "RSS Collection";
      problems.push("All active sources failed to fetch or parse.");
    } else if (failedFeeds.length > 0) {
      level = maxLevel(level ?? "warning", "warning");
      if (primaryStage === "Desk Run") primaryStage = "RSS Collection";
    }

    if (collect.save && fetchedAny && collect.totals.inserted === 0) {
      level = maxLevel(level ?? "warning", "warning");
      if (primaryStage === "Desk Run") primaryStage = "RSS Collection";
      problems.push("New candidates: 0");
    }

    if (insertFailed > 0) {
      level = maxLevel(level ?? "warning", "warning");
      if (primaryStage === "Desk Run") primaryStage = "RSS Collection";
      problems.push(`${insertFailed} candidate DB insert(s) failed`);
    }

    resultLines.push(`Collected: ${checked}`);
    resultLines.push(`Saved: ${collect.totals.inserted}`);
    if (failedFeeds.length > 0) {
      resultLines.push(`Failed sources: ${failedFeeds.length}`);
    }
  }

  // --- AI recommend ---
  if (!recommend.ok) {
    level = maxLevel(level ?? "warning", "error");
    primaryStage = "AI Recommend";
    problems.push(
      `AI recommendation failed (${sanitizeDeskAlertError(
        recommend.step
          ? `${recommend.step}: ${recommend.error}`
          : recommend.error
      )})`
    );
  } else if (recommend.queued > 0) {
    const updated = recommend.updated ?? 0;
    if (updated === 0) {
      level = maxLevel(level ?? "warning", "error");
      primaryStage = "AI Recommend";
      problems.push(
        `AI recommendation save failed (${recommend.queued} queued, 0 saved)`
      );
    } else if (updated < recommend.queued) {
      level = maxLevel(level ?? "warning", "warning");
      if (primaryStage === "Desk Run") primaryStage = "AI Recommend";
      problems.push(
        `${recommend.queued - updated} AI recommend update(s) failed`
      );
    }
  }

  // --- Discord brief ---
  if (!discord.dryRun) {
    const eligible = discord.briefEligibleCount;
    const hasBriefErrors = discord.errors.length > 0;

    if (discord.errors.some((e) => e.startsWith("fetch:"))) {
      level = maxLevel(level ?? "warning", "error");
      primaryStage = "Discord Brief";
      problems.push(
        `Brief candidate fetch failed (${sanitizeDeskAlertError(
          discord.errors.find((e) => e.startsWith("fetch:")) ?? "fetch error"
        )})`
      );
    } else if (discord.errors.some((e) => e.startsWith("discord:env"))) {
      level = maxLevel(level ?? "warning", "error");
      primaryStage = "Discord Brief";
      problems.push("Discord env not configured for brief send");
    } else if (eligible > 0 && discord.sent === 0 && hasBriefErrors) {
      level = maxLevel(level ?? "warning", "error");
      primaryStage = "Discord Brief";
      problems.push(
        `Discord brief send failed (${eligible} best/priority eligible, sent=0)`
      );
      const sendErr = discord.errors.find(
        (e) => e.startsWith("send:") || e.startsWith("mark:")
      );
      if (sendErr) {
        problems.push(`Detail: ${sanitizeDeskAlertError(sendErr)}`);
      }
    } else if (hasBriefErrors) {
      const markFails = discord.errors.filter((e) => e.startsWith("mark:"));
      if (markFails.length > 0) {
        // Partial sent-flag DB failures while desk continues → WARNING
        // Unless nothing was sent (already covered as ERROR above).
        if (discord.sent > 0) {
          level = maxLevel(level ?? "warning", "warning");
          if (primaryStage === "Desk Run") primaryStage = "Discord Brief";
          problems.push(
            `${markFails.length} Discord sent-flag DB update(s) failed`
          );
        } else if (eligible > 0) {
          level = maxLevel(level ?? "warning", "error");
          primaryStage = "Discord Brief";
          problems.push("Discord sent-flag DB update failed");
        }
      }
    }

    resultLines.push(`Brief sent: ${discord.sent}`);
  }

  if (!level || problems.length === 0) return null;

  const headline =
    level === "error"
      ? "🚨 Miracle News Desk ERROR"
      : "⚠️ Miracle News Desk WARNING";

  return {
    level,
    region: input.region,
    deskLabel: deskLabelForRegion(input.region),
    timeEt: formatDeskAlertTimeEt(now),
    primaryStage,
    lines: [headline, ...problems],
    sourceStatuses,
    resultLines,
  };
}

export function formatDeskSystemAlertMessage(alert: DeskSystemAlert): string {
  const parts = [
    alert.lines[0],
    "",
    `Desk: ${alert.deskLabel}`,
    `Time: ${alert.timeEt}`,
  ];

  if (alert.lines.length > 1) {
    parts.push("", "Problems:");
    for (const line of alert.lines.slice(1)) {
      parts.push(`- ${line}`);
    }
  }

  if (alert.resultLines.length > 0) {
    parts.push("", "Result:");
    for (const line of alert.resultLines) {
      parts.push(line);
    }
  }

  return parts.join("\n");
}
