import type { ShortsDesk } from "@/lib/shorts/shortsPolicy";
import {
  SHORTS_CLOSING_LINE,
  type ShortsProductionPackageContent,
} from "@/lib/shorts/shortsPackageTypes";
import type { ShortsPublishedArticleRow } from "@/lib/shorts/fetchPublishedArticlesForShorts";
import { SHORTS_TARGET_SECONDS } from "@/lib/shorts/shortsPolicy";
import {
  attachServerBuiltSources,
  hannoonPublicTitle,
} from "@/lib/shorts/buildShortsSources";

function articleSummary(article: ShortsPublishedArticleRow): string {
  return (
    article.summary_ko?.trim() ||
    article.summary_original?.trim() ||
    article.body_translated?.trim()?.slice(0, 200) ||
    article.body_original?.trim()?.slice(0, 200) ||
    ""
  );
}

function deskLabel(desk: ShortsDesk): string {
  return desk === "morning" ? "한눈 아침뉴스" : "한눈 저녁뉴스";
}

/**
 * Deterministic local stub generator — no OpenAI call.
 * Uses published article fields only; suitable for Phase 2 local dev/tests.
 */
export function generateStubShortsPackage(input: {
  desk: ShortsDesk;
  editDate: string;
  articles: ShortsPublishedArticleRow[];
  generatedAt?: string;
}): ShortsProductionPackageContent {
  const { desk, editDate, articles } = input;
  const label = deskLabel(desk);
  const headlines = articles.map(hannoonPublicTitle);

  const hook =
    headlines.length === 1
      ? `오늘 ${label} — ${headlines[0]}`
      : `오늘 ${label} — ${headlines[0]} 외 ${headlines.length - 1}건`;

  const title = `${label} · ${editDate}`;

  const intro =
    desk === "morning"
      ? "미국과 국제 이슈를 한눈에 정리합니다."
      : "오늘 한국에서 주목할 소식을 정리합니다.";

  const bodyParts = articles.map((article, index) => {
    const titleText = hannoonPublicTitle(article);
    const summary = articleSummary(article);
    const lead = summary
      ? `${index + 1}번째 소식. ${titleText}. ${summary}`
      : `${index + 1}번째 소식. ${titleText}.`;
    return lead.replace(/\s+/g, " ").trim();
  });

  const narration = [intro, ...bodyParts, SHORTS_CLOSING_LINE].join(" ");

  const perSceneSec = Math.round(SHORTS_TARGET_SECONDS / articles.length);
  const scenes = articles.map((article, index) => {
    const titleText = hannoonPublicTitle(article);
    const summary = articleSummary(article);
    return {
      index: index + 1,
      subtitle: summary ? `${titleText} — ${summary.slice(0, 120)}` : titleText,
      visualPlan:
        article.thumbnail_url?.trim()
          ? `기사 썸네일(${article.source || "출처"})을 전면에 배치하고 핵심 키워드를 자막으로 표시`
          : `출처(${article.source || "미상"}) 로고와 핵심 키워드 텍스트 카드`,
      durationSec: perSceneSec,
    };
  });

  const draft: ShortsProductionPackageContent = {
    title,
    hook,
    narration,
    scenes,
    articleMediaSuggestions: [],
    sourceArticles: [],
    estimatedDurationSec: SHORTS_TARGET_SECONDS,
    closingLine: SHORTS_CLOSING_LINE,
  };

  return attachServerBuiltSources(draft, articles);
}
