/**
 * Home NewsThumbnail variant policy — fixture only (no DB / OpenAI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  newsThumbFitForVariant,
  newsThumbFrameForVariant,
} from "@/components/home/NewsThumbnail";

describe("NewsThumbnail home variants (fixture only)", () => {
  it("hero uses contain; repeating cards use cover", () => {
    assert.equal(newsThumbFitForVariant("hero"), "contain");
    assert.equal(newsThumbFitForVariant("sourceCard"), "cover");
    assert.equal(newsThumbFitForVariant("categoryCard"), "cover");
    assert.equal(newsThumbFitForVariant("listThumb"), "cover");
  });

  it("source and category frames are identical 16:10 width-full (no min/max height)", () => {
    const source = newsThumbFrameForVariant("sourceCard");
    const category = newsThumbFrameForVariant("categoryCard");
    assert.equal(source, category);
    assert.match(source, /aspect-\[16\/10\]/);
    assert.match(source, /\bw-full\b/);
    assert.doesNotMatch(source, /min-h-/);
    assert.doesNotMatch(source, /max-h-/);
  });

  it("HomeNewsView wires source/category variants and editorial cover thumbs", () => {
    const view = readFileSync(
      join(process.cwd(), "components/home/HomeNewsView.tsx"),
      "utf8"
    );
    assert.match(view, /newsThumbFrameForVariant\("sourceCard"\)/);
    assert.match(view, /variant="sourceCard"/);
    assert.match(view, /newsThumbFrameForVariant\("categoryCard"\)/);
    assert.match(view, /variant="categoryCard"/);
    assert.doesNotMatch(view, /min-h-\[168px\]/);
    assert.match(view, /function FeaturedHero[\s\S]*objectFit="cover"/);
    assert.match(view, /StoryListRow/);
    assert.match(view, /CategoryLead/);
  });
});
