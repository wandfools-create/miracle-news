import type { BodyExtractMethodCategory } from "./publisherExtractors/types";

export type ExtractionStepLog = {
  step: string;
  ok: boolean;
  length: number;
  detail?: string;
};

export type JsonLdArticleFields = {
  articleBody: string | null;
  headline: string | null;
  datePublished: string | null;
};

export type ArticleBodyExtractionResult = {
  body: string | null;
  method: string;
  methodCategory: BodyExtractMethodCategory;
  steps: ExtractionStepLog[];
  success: boolean;
  jsonLd: JsonLdArticleFields;
  publisher: string | null;
  paragraphCount: number;
};
