import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildScrollHash,
  parseScrollYFormValue,
  readScrollYFromHash,
} from "./candidateListScroll";
import { collectionCandidatesListPath } from "./listPathFromForm";

describe("candidate list scroll preserve (fixture only)", () => {
  it("parses hash and form scrollY", () => {
    assert.equal(readScrollYFromHash("#ccy=420"), 420);
    assert.equal(readScrollYFromHash("ccy=0"), 0);
    assert.equal(readScrollYFromHash("#other=1"), null);
    assert.equal(parseScrollYFormValue("315"), 315);
    assert.equal(parseScrollYFormValue("nope"), null);
    assert.equal(buildScrollHash(88.7), "ccy=89");
  });

  it("appends scroll hash on redirect path without changing filters", () => {
    const fd = new FormData();
    fd.set("viewFilter", "ai");
    fd.set("statusFilter", "actionable");
    fd.set("sourceFilter", "bbc");
    fd.set("dateFilter", "all");
    fd.set("categoryFilter", "politics");
    fd.set("scrollY", "640");
    const path = collectionCandidatesListPath(fd, { shortlisted: "1" });
    assert.match(path, /source=bbc/);
    assert.match(path, /category=politics/);
    assert.match(path, /shortlisted=1/);
    assert.match(path, /#ccy=640$/);
    assert.doesNotMatch(path, /scrollY=/);
  });
});
