import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRegionalDeskRunPlan } from "@/lib/cron/deskRunCadence";
import { isEditorialDiscordEnabled } from "@/lib/discord/editorialDiscordPolicy";

describe("editorialDiscordPolicy", () => {
  it("defaults to enabled when env unset", () => {
    const prev = process.env.EDITORIAL_DISCORD_ENABLED;
    delete process.env.EDITORIAL_DISCORD_ENABLED;
    assert.equal(isEditorialDiscordEnabled(), true);
    process.env.EDITORIAL_DISCORD_ENABLED = prev;
  });

  it("skips desk brief when editorial discord disabled", () => {
    const prev = process.env.EDITORIAL_DISCORD_ENABLED;
    process.env.EDITORIAL_DISCORD_ENABLED = "false";
    const plan = resolveRegionalDeskRunPlan({
      region: "us-intl",
      searchParams: new URLSearchParams({ forceBrief: "1" }),
    });
    assert.equal(plan.runBrief, false);
    process.env.EDITORIAL_DISCORD_ENABLED = prev;
  });
});
