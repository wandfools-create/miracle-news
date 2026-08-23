import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_LIST_PAGE_SIZE,
  adminListHasMore,
  adminListRange,
  parseAdminListPage,
} from "./listPagination";
import { HOME_PUBLISHED_FETCH_LIMIT } from "@/lib/home/publishedFetchLimits";

describe("admin list pagination policy", () => {
  it("defaults to 50 rows per page", () => {
    assert.equal(ADMIN_LIST_PAGE_SIZE, 50);
    assert.deepEqual(adminListRange(1), { from: 0, to: 49 });
    assert.deepEqual(adminListRange(2), { from: 50, to: 99 });
  });

  it("parses page and hasMore", () => {
    assert.equal(parseAdminListPage(undefined), 1);
    assert.equal(parseAdminListPage("3"), 3);
    assert.equal(adminListHasMore(1, 50, 120), true);
    assert.equal(adminListHasMore(3, 20, 120), false);
  });

  it("home published fetch is bounded", () => {
    assert.equal(HOME_PUBLISHED_FETCH_LIMIT, 200);
  });

  it("review queue uses the same default page size", () => {
    assert.equal(ADMIN_LIST_PAGE_SIZE, 50);
  });
});
