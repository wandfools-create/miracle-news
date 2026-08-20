import type { JsonLdArticleFields } from "../articleBodyTypes";

/** High-level extraction channel for logs and diagnostics. */
export type BodyExtractMethodCategory =
  | "jsonld"
  | "article"
  | "structured"
  | "og-description"
  | "generic"
  | "playwright";

export type PublisherKey = "ap" | "fox" | "pbs" | "csm";

export type PublisherExtractStep = {
  step: string;
  ok: boolean;
  length: number;
  detail?: string;
};

export type PublisherExtractResult = {
  publisher: PublisherKey;
  body: string | null;
  /** e.g. `fox:jsonld`, `pbs:article` */
  method: string;
  methodCategory: BodyExtractMethodCategory;
  steps: PublisherExtractStep[];
  success: boolean;
};

export type PublisherExtractorContext = {
  html: string;
  pageUrl: string;
  jsonLd: JsonLdArticleFields;
};

export type PublisherExtractor = {
  key: PublisherKey;
  hostPatterns: RegExp[];
  extract(ctx: PublisherExtractorContext): PublisherExtractResult;
};
