import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateEditorialRules,
  normalizeEditorialText,
} from "./evaluateEditorialRules";
import type { EditorialCollectionRule } from "./types";

const rule = (patch: Partial<EditorialCollectionRule> = {}): EditorialCollectionRule => ({
  id: "rule-1",
  name: "생활성 기사 제외",
  action: "exclude",
  keywords: ["오늘의 운세", "local festival"],
  contentDescription: null,
  sourceKey: null,
  priority: 10,
  isActive: true,
  ...patch,
});

test("normalizes unicode, case and whitespace", () => {
  assert.equal(normalizeEditorialText("  ＬＯＣＡＬ   Festival "), "local festival");
});

test("matches Korean particles and English words without partial-word false positives", () => {
  assert.equal(evaluateEditorialRules({ title: "오늘의 운세를 확인하세요", sourceKey: "x" }, [rule()]).action, "exclude");
  assert.equal(evaluateEditorialRules({ title: "Local festivals guide", sourceKey: "x" }, [rule()]).action, "exclude");
  assert.equal(evaluateEditorialRules({ title: "Festivalization policy", sourceKey: "x" }, [rule()]).action, "none");
});

test("important exception signal sends an exclusion match to review", () => {
  const result = evaluateEditorialRules(
    { title: "지역 축제 압사 사고로 20명 사망", sourceKey: "x" },
    [rule({ keywords: ["지역 축제"] })]
  );
  assert.equal(result.action, "review");
  assert.deepEqual(result.exceptionSignals, ["casualty"]);
});

test("source-scoped rule does not affect another outlet", () => {
  const result = evaluateEditorialRules(
    { title: "오늘의 운세", sourceKey: "source-b" },
    [rule({ sourceKey: "source-a" })]
  );
  assert.equal(result.action, "none");
});

test("highest-priority matching rule wins deterministically", () => {
  const result = evaluateEditorialRules(
    { title: "오늘의 운세", sourceKey: "x" },
    [rule(), rule({ id: "priority", name: "검토", action: "review", priority: 20 })]
  );
  assert.equal(result.ruleId, "priority");
  assert.equal(result.action, "review");
});

test("RSS exclusion fails open when its audit write fails", () => {
  const source = readFileSync(
    resolve(process.cwd(), "lib/rss/collectRssToReviewQueue.ts"),
    "utf8"
  );
  assert.match(source, /exclusion audit failed; keeping candidate/);
  assert.match(source, /review\.push\(item\)/);
  assert.doesNotMatch(source, /OpenAI.*evaluateEditorialRules/);
});

test("migration keeps rule data admin-only and audit body-free", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "migrations/20260902_editorial_collection_rules.sql"),
    "utf8"
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.editorial_collection_audit FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(migration, /\bbody\b\s+text/i);
  assert.doesNotMatch(migration, /\bsummary\b\s+text/i);
});
