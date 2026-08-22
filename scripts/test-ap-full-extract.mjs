/**
 * Local extraction-only check for AP full story body (no OpenAI).
 * Usage: node scripts/test-ap-full-extract.mjs [/path/to/ap.html]
 */
import { readFileSync } from "fs";
import { JSDOM } from "jsdom";

const ARTICLE_BODY_MAX_CHARS = 24_000;

const CHROME_SELECTOR = [
  "script",
  "style",
  "nav",
  "aside",
  "footer",
  "header",
  "[role='navigation']",
  ".Carousel",
  ".Author-bio",
  ".PageList",
  ".PageListStandardB",
  ".Comments",
  ".CommentCount",
  ".VideoPlayer",
  ".EmbeddedVideo",
  ".SocialShare",
  ".Page-actions",
  ".fs-feed-ad",
  "[class*='Newsletter']",
  "[class*='Related']",
  "[class*='Promo']",
  "[class*='Advert']",
  "[data-key='related']",
].join(", ");

function collapseInlineWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function splitBodyParagraphs(text) {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
  if (!cleaned) return [];
  const blankSeparated = cleaned
    .split(/\n\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => collapseInlineWhitespace(line))
        .filter(Boolean)
        .join(" ")
    )
    .map((p) => p.trim())
    .filter(Boolean);
  if (blankSeparated.length >= 2) return blankSeparated;
  const only = blankSeparated[0] ?? "";
  if (!only) return [];
  const lines = only
    .split("\n")
    .map((line) => collapseInlineWhitespace(line))
    .filter(Boolean);
  const substantive = lines.filter((line) => line.length >= 40);
  if (lines.length >= 2 && substantive.length >= 2) return lines;
  return [lines.join(" ").trim()].filter(Boolean);
}

function normalizeBody(text, maxLen = ARTICLE_BODY_MAX_CHARS) {
  const paragraphs = splitBodyParagraphs(text);
  const plain = paragraphs.join("\n\n").trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1)}…`;
}

function cleanText(node) {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

function dedupePreserveOrder(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function extractApFullStoryBlocks(doc) {
  const root =
    doc.querySelector(".Page-storyBody") ||
    doc.querySelector("div[class*='Page-storyBody']") ||
    doc.querySelector("article") ||
    doc.querySelector("main");
  if (!root) return [];

  const blocks = [];
  for (const el of root.querySelectorAll("h2, h3, p")) {
    if (el.closest(CHROME_SELECTOR)) continue;
    const tag = el.tagName.toLowerCase();
    const text = cleanText(el);
    const minLen = tag === "h2" || tag === "h3" ? 12 : 25;
    if (text.length < minLen) continue;
    if (tag === "p" && text.length < 120 && /\(AP Photo\//i.test(text)) continue;
    blocks.push(text);
  }
  return dedupePreserveOrder(blocks);
}

const htmlPath = process.argv[2] || "/tmp/ap-extract-test/ap.html";
const html = readFileSync(htmlPath, "utf8");
const doc = new JSDOM(html, {
  url: "https://apnews.com/article/redistricting-congress-missouri-trump-gerrymandering-45b51672b78081dc7609e763a0416534",
}).window.document;

for (const node of doc.querySelectorAll(CHROME_SELECTOR)) node.remove();

const blocks = extractApFullStoryBlocks(doc);
const body = normalizeBody(blocks.join("\n\n"));
const paragraphCount = splitBodyParagraphs(body).filter((p) => p.length >= 40)
  .length;

console.log(
  JSON.stringify(
    {
      method: "ap:Page-storyBody-full",
      bodyLength: body.length,
      paragraphCount,
      blockCount: blocks.length,
    },
    null,
    2
  )
);

const needles = [
  "Missouri’s redistricting targeted Democratic congressman",
  "Lawsuit highlights dispute about referendum rights",
  "Redistricting battle spread to numerous states",
];
for (const n of needles) {
  console.log(`HAS ${n}: ${body.includes(n)}`);
}
