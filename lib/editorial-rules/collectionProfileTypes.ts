import type {
  CollectionFieldRealm,
  CollectionRegionScope,
} from "@/lib/editorial-rules/fieldTaxonomy";

/** Resolved field used at evaluate time (built-in or custom). */
export type CollectionFieldConfig = {
  id: string;
  realm: CollectionFieldRealm;
  labelKo: string;
  enabled: boolean;
  isCustom: boolean;
  collectKeywords: string[];
  excludeKeywords: string[];
  /** Soft-deleted custom fields stay in store but are ignored. */
  deletedAt: string | null;
};

export type CollectionCountryConfig = {
  /** ISO 3166-1 alpha-2, uppercase. */
  iso: string;
  nameKo: string;
  enabled: boolean;
  collectKeywords: string[];
  excludeKeywords: string[];
  deletedAt: string | null;
};

export type CollectionFieldProfile = {
  acceptUnclassified: boolean;
  regionScope: CollectionRegionScope;
  fields: CollectionFieldConfig[];
  countries: CollectionCountryConfig[];
  updatedAt: string | null;
  updatedBy: string | null;
  /** False when profile table missing — evaluate uses code defaults, collect fail-open for field excludes. */
  schemaReady: boolean;
};

export type FieldMatchHit = {
  fieldId: string;
  labelKo: string;
  enabled: boolean;
  matchedCollect: string[];
  matchedExclude: string[];
};

export type CollectionFieldDecision = {
  action: "exclude" | "review" | "none";
  reason: string;
  /** Stable id for audit rule_name / rule_id placeholder. */
  decisionKey: string;
  matchedFields: FieldMatchHit[];
  exceptionSignals: string[];
  rescuedFromExclude: boolean;
  /** True when country could not be confidently detected so country excludes were skipped. */
  countrySkippedUncertain: boolean;
  lowConfidence: boolean;
};
