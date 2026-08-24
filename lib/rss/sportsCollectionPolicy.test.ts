import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getSportsCollectionSkipReason } from "./sportsCollectionPolicy";

describe("sports collection policy (fixture only, no OpenAI)", () => {
  it("skips routine game results and league news", () => {
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Lakers beat Celtics 112-108 in overtime thriller",
        url: "https://example.com/sports/nba/lakers-celtics",
      })
    );
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Star QB suffers season-ending ACL injury",
        summary: "Team expects him to miss entire season after surgery.",
        url: "https://www.foxnews.com/sports/nfl-injury",
      })
    );
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Manchester United signs striker in $50M transfer deal",
        url: "https://www.bbc.com/sport/football/123",
      })
    );
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Coach fired after six-game losing streak",
        url: "https://apnews.com/sports/nfl/coach-fired",
      })
    );
    assert.ok(
      getSportsCollectionSkipReason({
        title: "NFL Week 3 preview: key matchups to watch",
        url: "https://apnews.com/sports/nfl-preview",
      })
    );
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Standings update: Yankees lead AL East",
        url: "https://example.com/mlb/standings",
      })
    );
  });

  it("skips minor mega-event sports items", () => {
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Olympics: Swimmer wins heat in qualifying round",
        url: "https://www.bbc.com/sport/olympics/qualifying",
      })
    );
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Super Bowl: Star wide receiver ruled out with ankle injury",
        url: "https://www.foxnews.com/sports/super-bowl-injury",
      })
    );
    assert.ok(
      getSportsCollectionSkipReason({
        title: "Olympics daily recap: all results from Day 3",
        url: "https://apnews.com/sports/olympics-recap",
      })
    );
  });

  it("allows mega-event major news and Korea/US headline results", () => {
    assert.equal(
      getSportsCollectionSkipReason({
        title:
          "Paris Olympics opening ceremony draws global attention amid tensions",
        url: "https://www.bbc.com/sport/olympics/opening-ceremony",
      }),
      null
    );
    assert.equal(
      getSportsCollectionSkipReason({
        title: "South Korea wins historic gold in archery at Olympics",
        url: "https://www.yonhapnews.co.kr/sports/olympics-gold",
      }),
      null
    );
    assert.equal(
      getSportsCollectionSkipReason({
        title: "Olympics boycott debate grows over host nation human rights",
        summary: "Lawmakers question participation as protests spread.",
        url: "https://apnews.com/article/olympics-boycott-human-rights",
      }),
      null
    );
    assert.equal(
      getSportsCollectionSkipReason({
        title: "FIFA World Cup opening ceremony highlights host city controversy",
        url: "https://www.bbc.com/sport/football/world-cup-opening",
      }),
      null
    );
  });

  it("allows sports stories with general news value", () => {
    assert.equal(
      getSportsCollectionSkipReason({
        title: "NFL player's murder trial opens as national debate intensifies",
        url: "https://www.apnews.com/sports/nfl-trial",
      }),
      null
    );
    assert.equal(
      getSportsCollectionSkipReason({
        title: "Stadium collapse kills dozens — government launches investigation",
        url: "https://example.com/sports/stadium-disaster",
      }),
      null
    );
    assert.equal(
      getSportsCollectionSkipReason({
        title: "War sanctions affect Olympic participation, diplomats say",
        url: "https://www.bbc.com/sport/olympics/sanctions",
      }),
      null
    );
  });

  it("does not filter non-sports general news", () => {
    assert.equal(
      getSportsCollectionSkipReason({
        title: "Congress passes budget bill after late-night vote",
        url: "https://apnews.com/article/congress-budget",
      }),
      null
    );
    assert.equal(
      getSportsCollectionSkipReason({
        title: "Researchers find new climate signal in ocean data",
        url: "https://www.sciencedaily.com/releases/2026/08/climate",
      }),
      null
    );
  });

  it("prefilter wires sports policy without OpenAI", () => {
    const prefilter = readFileSync(
      join(process.cwd(), "lib/rss/rssItemPrefilter.ts"),
      "utf8"
    );
    assert.match(prefilter, /getSportsCollectionSkipReason/);
    assert.match(prefilter, /summary/);
    assert.doesNotMatch(prefilter, /from ["']@\/lib\/openai/);
  });
});
