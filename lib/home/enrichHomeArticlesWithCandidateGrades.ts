/**
 * Attach candidate AI recommend grade/score onto home cards via article_id.
 * Stable key: collection_candidates.article_id (no URL fuzzy match).
 * Single batch query; failures fall back to unchanged cards (home still renders).
 */
import "server-only";
import { supabase } from "@/lib/supabase";
import {
  normalizeStoredAiRecommendGrade,
  normalizeStoredAiRecommendScore,
  pickBestCandidateGradeRow,
  type CandidateGradeRow,
} from "./aiRecommendSnapshot";
import type { HomeArticleCard } from "./types";

export async function enrichHomeArticlesWithCandidateGrades(
  articles: HomeArticleCard[]
): Promise<HomeArticleCard[]> {
  if (articles.length === 0) return articles;

  const needLookup = articles.filter(
    (a) =>
      a.ai_recommend_grade == null &&
      a.ai_recommend_score == null &&
      (a.article_id || a.id)
  );
  if (needLookup.length === 0) return articles;

  const ids = [
    ...new Set(needLookup.map((a) => a.article_id ?? a.id).filter(Boolean)),
  ];
  if (ids.length === 0) return articles;

  let data: CandidateGradeRow[] | null = null;
  try {
    const result = await supabase
      .from("collection_candidates")
      .select("article_id, ai_recommend_grade, ai_recommend_score")
      .in("article_id", ids);

    if (result.error) {
      // Do not log message/details (may include request context). Home falls back.
      console.info(
        "[home] candidate grade join skipped",
        result.error.code ?? "error"
      );
      return articles;
    }
    data = (result.data ?? null) as CandidateGradeRow[] | null;
  } catch {
    console.info("[home] candidate grade join skipped", "exception");
    return articles;
  }

  if (!data || data.length === 0) return articles;

  const rowsByArticle = new Map<string, CandidateGradeRow[]>();
  for (const row of data) {
    if (!row.article_id) continue;
    const list = rowsByArticle.get(row.article_id) ?? [];
    list.push(row);
    rowsByArticle.set(row.article_id, list);
  }

  const bestByArticle = new Map<string, CandidateGradeRow>();
  for (const [articleId, rows] of rowsByArticle) {
    const best = pickBestCandidateGradeRow(rows);
    if (best) bestByArticle.set(articleId, best);
  }

  return articles.map((article) => {
    if (article.ai_recommend_grade != null || article.ai_recommend_score != null) {
      return article;
    }
    const key = article.article_id ?? article.id;
    const row = bestByArticle.get(key);
    if (!row) return article;
    return {
      ...article,
      ai_recommend_grade: normalizeStoredAiRecommendGrade(row.ai_recommend_grade),
      ai_recommend_score: normalizeStoredAiRecommendScore(row.ai_recommend_score),
    };
  });
}
