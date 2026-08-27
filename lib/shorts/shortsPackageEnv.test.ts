import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isShortsOpenAiEnabled,
  resolveShortsOpenAiModel,
} from "./shortsPackageEnv";

describe("shortsPackageEnv", () => {
  it("defaults OpenAI off unless SHORTS_AI_OPENAI_ENABLED=1", () => {
    assert.equal(isShortsOpenAiEnabled({}), false);
    assert.equal(isShortsOpenAiEnabled({ SHORTS_AI_OPENAI_ENABLED: "1" }), true);
  });

  it("resolves shorts model fallback chain", () => {
    assert.equal(
      resolveShortsOpenAiModel({ OPENAI_SHORTS_MODEL: "s" }),
      "s"
    );
  });
});
