import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  categoryValueToLabel,
  normalizeRssFeedItem,
  parseRssFeedXml,
  pickRssCategories,
} from "./parseRssFeed";

function nullProtoCategory(label: string, domain: string) {
  return Object.assign(Object.create(null), {
    _: label,
    $: Object.assign(Object.create(null), { domain }),
  });
}

const PBS_FOX_STYLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Fixture Feed</title>
    <item>
      <title>Good politics story</title>
      <link>https://example.com/politics/1</link>
      <guid>https://example.com/politics/1</guid>
      <category domain="https://example.com/tag/politics">Politics</category>
      <description>Summary one</description>
    </item>
    <item>
      <title>Good world story</title>
      <link>https://example.com/world/2</link>
      <guid>https://example.com/world/2</guid>
      <category domain="foxnews.com/metadata/dc.identifier">067e8094-ee70-5922-9cc5-db49acfb649a</category>
      <description>Summary two</description>
    </item>
    <item>
      <title></title>
      <link>https://example.com/empty-title</link>
    </item>
  </channel>
</rss>`;

describe("PBS/Fox RSS category parser hotfix (fixture only)", () => {
  it("extracts PBS/Fox null-prototype category objects without String(object)", () => {
    const cat = nullProtoCategory(
      "Politics",
      "https://www.pbs.org/newshour/tag/politics"
    );
    assert.equal(categoryValueToLabel(cat), "Politics");
    assert.doesNotThrow(() => pickRssCategories({ categories: [cat] }));
    assert.deepEqual(pickRssCategories({ categories: [cat] }), ["Politics"]);
  });

  it("handles string, array, missing, and invalid category shapes", () => {
    assert.deepEqual(pickRssCategories({ categories: ["정치"] }), ["정치"]);
    assert.deepEqual(pickRssCategories({ category: "스포츠" }), ["스포츠"]);
    assert.deepEqual(
      pickRssCategories({ categories: ["정치", "정치", "경제"] }),
      ["정치", "경제"]
    );
    assert.deepEqual(
      pickRssCategories({
        categories: ["A", nullProtoCategory("A", "https://x"), "B"],
      }),
      ["A", "B"]
    );
    assert.deepEqual(pickRssCategories({}), []);
    assert.deepEqual(pickRssCategories({ categories: undefined }), []);
    assert.deepEqual(
      pickRssCategories({
        categories: [
          null,
          undefined,
          42,
          true,
          Object.create(null),
          { $: { domain: "x" } },
          { _: 99 },
          { _: ["", "  ", "Valid"] },
          "  ",
        ],
      }),
      ["Valid"]
    );
    assert.equal(categoryValueToLabel(null), null);
    assert.equal(categoryValueToLabel(undefined), null);
    assert.equal(categoryValueToLabel(0), null);
    assert.equal(categoryValueToLabel(false), null);
  });

  it("never calls String on null-prototype category objects", () => {
    const cat = nullProtoCategory("Artemis II", "https://www.pbs.org/tag/x");
    assert.throws(() => String(cat), /Cannot convert object to primitive value/);
    assert.equal(categoryValueToLabel(cat), "Artemis II");
  });

  it("parses PBS/Fox-style category XML with ok:true and items > 0", async () => {
    const result = await parseRssFeedXml(PBS_FOX_STYLE_XML);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.items.length >= 2);
    assert.equal(result.items[0]?.title, "Good politics story");
    assert.deepEqual(result.items[0]?.categories, ["Politics"]);
    assert.equal(result.items[1]?.title, "Good world story");
    assert.ok(result.items[1]?.categories.length === 1);
  });

  it("isolates one broken item and keeps two good items", () => {
    const goodA = {
      title: "Alpha",
      link: "https://example.com/a",
      categories: [nullProtoCategory("Politics", "https://pbs.org/tag/politics")],
    };
    const goodB = {
      title: "Bravo",
      link: "https://example.com/b",
      category: "World",
    };
    const broken = {
      // Object title has no .trim — forces normalize try/catch path
      title: Object.create(null),
      link: "https://example.com/broken",
      categories: [nullProtoCategory("X", "https://x")],
    };

    const a = normalizeRssFeedItem(goodA);
    const b = normalizeRssFeedItem(goodB);
    const c = normalizeRssFeedItem(broken);

    assert.ok(a);
    assert.ok(b);
    assert.equal(c, null);
    assert.deepEqual(a?.categories, ["Politics"]);
    assert.deepEqual(b?.categories, ["World"]);
  });

  it("parseRssFeedXml keeps good items when one item cannot normalize", async () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Keep one</title>
      <link>https://example.com/1</link>
      <category domain="https://example.com/tag/politics">Politics</category>
    </item>
    <item>
      <title>Keep two</title>
      <link>https://example.com/2</link>
      <category>Economy</category>
    </item>
  </channel>
</rss>`;
    const result = await parseRssFeedXml(xml);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items[0]?.categories, ["Politics"]);
    assert.deepEqual(result.items[1]?.categories, ["Economy"]);
  });

  it("preserves Chosun/TV Chosun string category fixtures", () => {
    assert.deepEqual(pickRssCategories({ categories: ["정치"] }), ["정치"]);
    assert.deepEqual(pickRssCategories({ category: "스포츠" }), ["스포츠"]);
    assert.deepEqual(
      pickRssCategories({ categories: ["사회"], category: "경제" }),
      ["사회", "경제"]
    );
  });
});
