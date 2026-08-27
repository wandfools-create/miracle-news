import {
  SHORTS_ARTICLE_BODY_EXCERPT_MAX,
  SHORTS_CLOSING_LINE,
} from "@/lib/shorts/shortsPackageTypes";
import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";
import type { ShortsPublishedArticleRow } from "@/lib/shorts/fetchPublishedArticlesForShorts";
import { hannoonPublicTitle } from "@/lib/shorts/buildShortsSources";

function articleSummary(article: ShortsPublishedArticleRow): string {
  return (
    article.summary_ko?.trim() ||
    article.summary_original?.trim() ||
    ""
  );
}

function articleBodyExcerpt(article: ShortsPublishedArticleRow): string {
  const body =
    article.body_translated?.trim() || article.body_original?.trim() || "";
  return body.slice(0, SHORTS_ARTICLE_BODY_EXCERPT_MAX);
}

function deskLabel(desk: ShortsDesk): string {
  return desk === "morning" ? "한눈 아침뉴스 (US/International)" : "한눈 저녁뉴스 (Korea)";
}

export function buildShortsPackagePrompt(input: {
  desk: ShortsDesk;
  editDate: string;
  articles: ShortsPublishedArticleRow[];
}): { system: string; user: string } {
  const system = [
    "You are an editorial assistant for Miracle News Shorts (한눈).",
    "Output MUST be a single JSON object in Korean (title, hook, narration, scenes, etc.).",
    "Rules:",
    "- Use ONLY facts present in the provided article fields. Do not invent numbers, quotes, people, or outcomes that are not in the input.",
    "- Do not sensationalize politics, war, or disasters.",
    "- Target video length 60–90 seconds (estimatedDurationSec).",
    `- End narration with exactly: "${SHORTS_CLOSING_LINE}"`,
    "- Each scene needs subtitle and visualPlan.",
    "- articleMediaSuggestions and sourceArticles must cover every article with matching articleId.",
    "- sourceArticles title should be the Hannoon Korean headline; leave hannoonUrl/originalUrl null (server fills URLs).",
    "JSON shape:",
    "{",
    '  "title": string,',
    '  "hook": string,',
    '  "narration": string,',
    '  "scenes": [{ "index": number, "subtitle": string, "visualPlan": string, "durationSec"?: number }],',
    '  "articleMediaSuggestions": [{ "articleId": string, "title": string, "url": null, "imageSuggestion": string, "videoSuggestion": string }],',
    '  "sourceArticles": [{ "articleId": string, "title": string, "hannoonUrl": null, "sourceDisplayName": string|null, "originalUrl": null }],',
    '  "estimatedDurationSec": number,',
    `  "closingLine": "${SHORTS_CLOSING_LINE}"`,
    "}",
  ].join("\n");

  const articlesBlock = input.articles
    .map((article, i) => {
      return [
        `--- Article ${i + 1} ---`,
        `articleId: ${article.id}`,
        `source: ${article.source ?? ""}`,
        `title: ${hannoonPublicTitle(article)}`,
        `summary: ${articleSummary(article)}`,
        `body_excerpt: ${articleBodyExcerpt(article)}`,
      ].join("\n");
    })
    .join("\n\n");

  const user = [
    `Desk: ${deskLabel(input.desk)}`,
    `Edit date (America/New_York): ${input.editDate}`,
    `Article count: ${input.articles.length}`,
    "",
    articlesBlock,
  ].join("\n");

  return { system, user };
}
