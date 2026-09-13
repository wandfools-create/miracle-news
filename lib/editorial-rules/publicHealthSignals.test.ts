/**
 * Strong public-health signal fixtures (no OpenAI / DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectStrongPublicHealthSignal,
  isSoftPublicHealthNoise,
} from "@/lib/editorial-rules/publicHealthSignals";

describe("public health strong signals", () => {
  it("accepts authority + spread / disease combos", () => {
    assert.equal(
      detectStrongPublicHealthSignal(
        "CDC warns of measles outbreak as hospitalizations rise"
      ),
      true
    );
    assert.equal(
      detectStrongPublicHealthSignal(
        "WHO declares public health emergency for cholera"
      ),
      true
    );
  });

  it("rejects lone weak tokens and soft noise", () => {
    assert.equal(detectStrongPublicHealthSignal("virus research update"), false);
    assert.equal(detectStrongPublicHealthSignal("health and wellness"), false);
    assert.equal(
      detectStrongPublicHealthSignal("Computer virus spreads via email"),
      false
    );
    assert.equal(
      isSoftPublicHealthNoise("Celebrity health tips and diet wellness hacks"),
      true
    );
  });
});
