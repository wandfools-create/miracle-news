import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAdminUsableBodyExtraction,
  isSuccessfulBodyExtraction,
} from "./articleBodyValidation";
import { BODY_EXTRACTION_FAILED_METHOD } from "./constants";

describe("body extraction gates (fixture only)", () => {
  it("strict gate requires ≥400 chars", () => {
    assert.equal(
      isSuccessfulBodyExtraction({
        articleBodyPlain: "가".repeat(300),
        articleBodyExtractSuccess: true,
        articleBodyExtractMethod: "readability",
      }),
      false
    );
    assert.equal(
      isSuccessfulBodyExtraction({
        articleBodyPlain: "가".repeat(400),
        articleBodyExtractSuccess: true,
        articleBodyExtractMethod: "readability",
      }),
      true
    );
  });

  it("admin promote gate allows ≥120 chars when extraction succeeded", () => {
    assert.equal(
      isAdminUsableBodyExtraction({
        articleBodyPlain: "가".repeat(120),
        articleBodyExtractSuccess: true,
        articleBodyExtractMethod: "readability",
      }),
      true
    );
    assert.equal(
      isAdminUsableBodyExtraction({
        articleBodyPlain: "가".repeat(119),
        articleBodyExtractSuccess: true,
        articleBodyExtractMethod: "readability",
      }),
      false
    );
  });

  it("admin gate still rejects meta-description / failed extraction", () => {
    assert.equal(
      isAdminUsableBodyExtraction({
        articleBodyPlain: "가".repeat(300),
        articleBodyExtractSuccess: true,
        articleBodyExtractMethod: "meta-description-fallback",
      }),
      false
    );
    assert.equal(
      isAdminUsableBodyExtraction({
        articleBodyPlain: "가".repeat(300),
        articleBodyExtractSuccess: false,
        articleBodyExtractMethod: "readability",
      }),
      false
    );
    assert.equal(
      isAdminUsableBodyExtraction({
        articleBodyPlain: "가".repeat(300),
        articleBodyExtractSuccess: true,
        articleBodyExtractMethod: BODY_EXTRACTION_FAILED_METHOD,
      }),
      false
    );
  });
});
