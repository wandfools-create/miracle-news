import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiRecommendGrade } from "./candidateRecommend";
import {
  applyAiRecommendPostProcess,
  clusterCandidatesByEvent,
  hasHighImportanceSignals,
  sportsGossipDemotionTarget,
} from "./candidateRecommendPostProcess";

function item(
  id: string,
  grade: AiRecommendGrade,
  title: string,
  summary: string,
  extra: Partial<{
    score: number;
    source: string;
    rssPublishedAt: string;
    originalUrl: string;
  }> = {}
) {
  return {
    id,
    grade,
    score: extra.score ?? 85,
    reason: "AI 판단",
    title,
    summary,
    source: extra.source ?? "ap",
    originalUrl: extra.originalUrl ?? "https://apnews.com/article/example",
    rssPublishedAt:
      extra.rssPublishedAt ?? "2026-08-24T12:00:00.000Z",
    createdAt: "2026-08-24T12:00:00.000Z",
  };
}

describe("candidateRecommendPostProcess (fixture only, no OpenAI)", () => {
  it("caps BEST to one per same-event cluster", () => {
    const processed = applyAiRecommendPostProcess([
      item(
        "a",
        "best",
        "Ukraine peace talks stall as Russia advances in east",
        "Diplomats say negotiations failed after new offensive."
      ),
      item(
        "b",
        "best",
        "Russia advances in eastern Ukraine as peace talks stall",
        "Negotiations collapse amid renewed fighting in Donbas region.",
        { source: "fox-news", score: 80 }
      ),
      item(
        "c",
        "best",
        "Peace talks over Ukraine war stall after Russian advance",
        "Western officials warn of further escalation in the east.",
        { source: "bbc", rssPublishedAt: "2026-08-24T11:00:00.000Z" }
      ),
    ]);

    const bestCount = processed.filter((p) => p.grade === "best").length;
    assert.equal(bestCount, 1);
    assert.equal(processed.find((p) => p.grade === "best")?.id, "a");
    const demoted = processed.filter((p) => p.grade !== "best");
    assert.equal(demoted.length, 2);
    assert.ok(demoted.every((p) => p.grade === "priority" || p.grade === "normal"));
  });

  it("demotes routine NFL game result from best to low/normal", () => {
    const target = sportsGossipDemotionTarget({
      title: "Chiefs beat Bills 27-24 in AFC championship thriller",
      summary: "Kansas City advances to the Super Bowl after a late touchdown.",
      originalUrl: "https://apnews.com/sports/nfl/chiefs-bills",
    });
    assert.ok(target === "low" || target === "normal");

    const processed = applyAiRecommendPostProcess([
      item(
        "nfl",
        "best",
        "Chiefs beat Bills 27-24 in AFC championship thriller",
        "Kansas City advances to the Super Bowl after a late touchdown.",
        { originalUrl: "https://apnews.com/sports/nfl/chiefs-bills" }
      ),
    ]);
    assert.notEqual(processed[0]?.grade, "best");
  });

  it("keeps mega-event major news from sports demotion", () => {
    const title =
      "Super Bowl security threat forces partial stadium evacuation";
    const summary =
      "Officials cite terror concerns as political leaders debate response.";
    assert.equal(
      sportsGossipDemotionTarget({
        title,
        summary,
        originalUrl: "https://apnews.com/sports/super-bowl-security",
      }),
      null
    );

    const processed = applyAiRecommendPostProcess([
      item("sb", "best", title, summary, {
        originalUrl: "https://apnews.com/sports/super-bowl-security",
      }),
    ]);
    assert.equal(processed[0]?.grade, "best");
  });

  it("keeps war/election priority grades", () => {
    assert.ok(
      hasHighImportanceSignals(
        "Congress votes on war powers after missile strike",
        "Lawmakers debate response to latest Middle East escalation."
      )
    );

    const processed = applyAiRecommendPostProcess([
      item(
        "war",
        "priority",
        "Congress votes on war powers after missile strike",
        "Lawmakers debate response to latest Middle East escalation."
      ),
      item(
        "election",
        "priority",
        "Presidential election recount ordered in key swing state",
        "Court rules ballots must be reviewed after tight margin."
      ),
    ]);
    assert.equal(processed[0]?.grade, "priority");
    assert.equal(processed[1]?.grade, "priority");
  });

  it("clusters similar headlines by token overlap", () => {
    const clusters = clusterCandidatesByEvent([
      item("1", "best", "Gaza ceasefire talks resume in Cairo", "Diplomats meet."),
      item("2", "best", "Ceasefire talks for Gaza resume in Cairo", "Egypt hosts mediators."),
    ]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0]?.length, 2);
  });

  it("does not promote to best from rules alone; PE may rise to priority", () => {
    const pe = applyAiRecommendPostProcess([
      item(
        "x",
        "normal",
        "Congress votes on war powers after missile strike",
        "Major escalation in the region."
      ),
    ]);
    assert.notEqual(pe[0]?.grade, "best");
    assert.equal(pe[0]?.grade, "priority");

    const soft = applyAiRecommendPostProcess([
      item(
        "y",
        "normal",
        "Local garden club hosts bake sale",
        "Neighbors share recipes.",
        { score: 40 }
      ),
    ]);
    assert.equal(soft[0]?.grade, "normal");
  });
});
