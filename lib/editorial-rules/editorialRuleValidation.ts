import { parseKeywordList } from "./matchKeywords";
import type {
  EditorialCollectionRule,
  EditorialRuleAction,
  EditorialRuleKind,
  EditorialRuleRegion,
} from "./types";

export type EditorialRuleValidationInput = {
  id?: string;
  name: string;
  kind: EditorialRuleKind;
  action: EditorialRuleAction;
  keywordsRaw: string;
  category: string | null;
  sourceKey: string | null;
  region: EditorialRuleRegion;
  priority: number;
  isActive: boolean;
  adminNote: string | null;
  confirmSourceWideExclude?: boolean;
};

export function validateEditorialRuleInput(
  input: EditorialRuleValidationInput,
  existing: EditorialCollectionRule[]
): { ok: true; keywords: string[] } | { ok: false; error: string } {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, error: "규칙 이름이 필요합니다." };

  const keywords =
    input.kind === "source" && !input.keywordsRaw.trim()
      ? []
      : parseKeywordList(input.keywordsRaw);

  if (input.kind === "keyword" && keywords.length === 0) {
    return { ok: false, error: "키워드를 하나 이상 입력하세요." };
  }
  if (input.kind === "category" && !input.category?.trim()) {
    return { ok: false, error: "카테고리를 입력하세요." };
  }
  if (input.kind === "source" && !input.sourceKey?.trim()) {
    return { ok: false, error: "출처 key를 선택하세요." };
  }
  if (
    input.kind === "source" &&
    input.action === "exclude" &&
    Boolean(input.sourceKey?.trim()) &&
    keywords.length === 0 &&
    !input.confirmSourceWideExclude
  ) {
    return {
      ok: false,
      error:
        "출처 전체 자동 제외는 확인이 필요합니다. 확인 문구를 체크하세요.",
    };
  }

  const nameKey = name.toLocaleLowerCase("und");
  const dupName = existing.find(
    (r) =>
      r.id !== input.id &&
      r.name.trim().toLocaleLowerCase("und") === nameKey
  );
  if (dupName) return { ok: false, error: "같은 이름의 규칙이 이미 있습니다." };

  if (input.kind === "keyword") {
    for (const kw of keywords) {
      const nk = kw.toLocaleLowerCase("und");
      const clash = existing.find(
        (r) =>
          r.id !== input.id &&
          r.kind === "keyword" &&
          r.action === input.action &&
          r.region === input.region &&
          (r.sourceKey ?? null) === (input.sourceKey?.trim() || null) &&
          r.keywords.some((x) => x.toLocaleLowerCase("und") === nk)
      );
      if (clash) {
        return {
          ok: false,
          error: `키워드 "${kw}"가 규칙 "${clash.name}"와 중복됩니다.`,
        };
      }
    }
  }

  return { ok: true, keywords };
}
