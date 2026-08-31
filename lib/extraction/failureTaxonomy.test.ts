import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapEnrichCategoryToFailureCode,
  normalizeExtractionFailureCode,
} from "@/lib/extraction/failureTaxonomy";

describe("failureTaxonomy", () => {
  it("normalizes known failure codes", () => {
    assert.equal(normalizeExtractionFailureCode("http-403"), "http-403");
    assert.equal(
      mapEnrichCategoryToFailureCode("paywall_blocked"),
      "subscription-or-paywall"
    );
  });
});
