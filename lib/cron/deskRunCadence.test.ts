import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  briefHourUtcForRegion,
  isRegionalBriefDue,
  resolveRegionalDeskRunPlan,
} from "@/lib/cron/deskRunCadence";

describe("regional desk collection cadence", () => {
  it("keeps the original two daily briefing slots", () => {
    assert.equal(briefHourUtcForRegion("us-intl"), 12);
    assert.equal(briefHourUtcForRegion("korea"), 0);
    assert.equal(
      isRegionalBriefDue("us-intl", new Date("2026-08-29T12:00:00Z")),
      true
    );
    assert.equal(
      isRegionalBriefDue("korea", new Date("2026-08-29T00:00:00Z")),
      true
    );
  });

  it("makes non-brief scheduled GETs collect-only", () => {
    assert.deepEqual(
      resolveRegionalDeskRunPlan({
        region: "us-intl",
        method: "GET",
        now: new Date("2026-08-29T06:00:00Z"),
      }),
      {
        collect: true,
        runBrief: false,
        reason: "scheduled_collect_only",
      }
    );
    assert.equal(
      resolveRegionalDeskRunPlan({
        region: "korea",
        method: "GET",
        now: new Date("2026-08-29T12:00:00Z"),
      }).runBrief,
      false
    );
  });

  it("runs the brief on each region's scheduled slot", () => {
    assert.equal(
      resolveRegionalDeskRunPlan({
        region: "us-intl",
        method: "GET",
        now: new Date("2026-08-29T12:00:00Z"),
      }).runBrief,
      true
    );
    assert.equal(
      resolveRegionalDeskRunPlan({
        region: "korea",
        method: "GET",
        now: new Date("2026-08-29T00:00:00Z"),
      }).runBrief,
      true
    );
  });

  it("preserves full manual POST and supports explicit overrides", () => {
    assert.equal(
      resolveRegionalDeskRunPlan({
        region: "us-intl",
        method: "POST",
        now: new Date("2026-08-29T06:00:00Z"),
      }).reason,
      "manual_post"
    );

    const collectOnly = new URLSearchParams({
      collectOnly: "1",
      forceBrief: "1",
    });
    assert.equal(
      resolveRegionalDeskRunPlan({
        region: "korea",
        method: "POST",
        searchParams: collectOnly,
      }).reason,
      "forced_collect_only"
    );

    assert.equal(
      resolveRegionalDeskRunPlan({
        region: "korea",
        method: "GET",
        searchParams: new URLSearchParams({ forceBrief: "1" }),
        now: new Date("2026-08-29T06:00:00Z"),
      }).reason,
      "forced_brief"
    );
  });

  it("uses GitHub catch-up for four collection slots and four total briefs", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/rss-collection-catchup.yml"),
      "utf8"
    );
    assert.match(workflow, /0 0,6,12,18 \* \* \*/);
    assert.match(workflow, /collectOnly=1/);
    assert.match(workflow, /secrets\.CRON_SECRET/);
    assert.match(workflow, /desk-us" "forceBrief=1"/);
    assert.match(workflow, /desk-kr" "forceBrief=1"/);
  });
});
