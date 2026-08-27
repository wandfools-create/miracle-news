import {
  SHORTS_MAX_SECONDS,
  SHORTS_MIN_SECONDS,
} from "@/lib/shorts/shortsPolicy";
import {
  SHORTS_CLOSING_LINE,
  type ShortsProductionPackageContent,
  type ShortsPackageScene,
  type ShortsArticleMediaSuggestion,
  type ShortsSourceArticleRef,
} from "@/lib/shorts/shortsPackageTypes";

export type ParseShortsPackageResult =
  | { ok: true; package: ShortsProductionPackageContent }
  | { ok: false; error: string; field?: string };

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function parseScenes(raw: unknown): ShortsPackageScene[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const scenes: ShortsPackageScene[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") return null;
    const subtitle = asNonEmptyString((item as { subtitle?: unknown }).subtitle);
    const visualPlan = asNonEmptyString(
      (item as { visualPlan?: unknown }).visualPlan
    );
    if (!subtitle || !visualPlan) return null;
    const durationRaw = (item as { durationSec?: unknown }).durationSec;
    const durationSec =
      typeof durationRaw === "number" && Number.isFinite(durationRaw)
        ? durationRaw
        : undefined;
    scenes.push({
      index:
        typeof (item as { index?: unknown }).index === "number"
          ? (item as { index: number }).index
          : i + 1,
      subtitle,
      visualPlan,
      durationSec,
    });
  }
  return scenes;
}

function parseMediaSuggestions(
  raw: unknown
): ShortsArticleMediaSuggestion[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ShortsArticleMediaSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const articleId = asNonEmptyString(
      (item as { articleId?: unknown }).articleId
    );
    const title = asNonEmptyString((item as { title?: unknown }).title);
    const imageSuggestion = asNonEmptyString(
      (item as { imageSuggestion?: unknown }).imageSuggestion
    );
    const videoSuggestion = asNonEmptyString(
      (item as { videoSuggestion?: unknown }).videoSuggestion
    );
    if (!articleId || !title || !imageSuggestion || !videoSuggestion) return null;
    out.push({
      articleId,
      title,
      url: asNullableString((item as { url?: unknown }).url),
      imageSuggestion,
      videoSuggestion,
    });
  }
  return out;
}

function parseSourceArticles(raw: unknown): ShortsSourceArticleRef[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ShortsSourceArticleRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const articleId = asNonEmptyString(
      (item as { articleId?: unknown }).articleId
    );
    const title = asNonEmptyString((item as { title?: unknown }).title);
    if (!articleId || !title) return null;

    const obj = item as {
      hannoonUrl?: unknown;
      url?: unknown;
      sourceDisplayName?: unknown;
      source?: unknown;
      originalUrl?: unknown;
    };

    out.push({
      articleId,
      title,
      hannoonUrl:
        asNullableString(obj.hannoonUrl) ?? asNullableString(obj.url),
      sourceDisplayName:
        asNullableString(obj.sourceDisplayName) ??
        asNullableString(obj.source),
      originalUrl: asNullableString(obj.originalUrl),
    });
  }
  return out;
}

export function parseShortsProductionPackageJson(
  raw: unknown
): ParseShortsPackageResult {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      error:
        "OpenAI/패키지 JSON이 객체가 아닙니다. 응답을 다시 생성하거나 형식을 확인하세요.",
      field: "root",
    };
  }

  const title = asNonEmptyString((raw as { title?: unknown }).title);
  const hook = asNonEmptyString((raw as { hook?: unknown }).hook);
  const narration = asNonEmptyString((raw as { narration?: unknown }).narration);
  if (!title || !hook || !narration) {
    return {
      ok: false,
      error: "title, hook, narration은 비어 있을 수 없습니다.",
      field: "core",
    };
  }

  const scenes = parseScenes((raw as { scenes?: unknown }).scenes);
  if (!scenes) {
    return { ok: false, error: "scenes 배열이 올바르지 않습니다.", field: "scenes" };
  }

  const articleMediaSuggestions = parseMediaSuggestions(
    (raw as { articleMediaSuggestions?: unknown }).articleMediaSuggestions
  );
  if (!articleMediaSuggestions) {
    return {
      ok: false,
      error: "articleMediaSuggestions 형식이 올바르지 않습니다.",
      field: "articleMediaSuggestions",
    };
  }

  const sourceArticles = parseSourceArticles(
    (raw as { sourceArticles?: unknown }).sourceArticles
  );
  if (!sourceArticles) {
    return {
      ok: false,
      error: "sourceArticles 형식이 올바르지 않습니다.",
      field: "sourceArticles",
    };
  }

  const durationRaw = (raw as { estimatedDurationSec?: unknown })
    .estimatedDurationSec;
  if (typeof durationRaw !== "number" || !Number.isFinite(durationRaw)) {
    return {
      ok: false,
      error: "estimatedDurationSec는 숫자여야 합니다.",
      field: "estimatedDurationSec",
    };
  }
  if (durationRaw < SHORTS_MIN_SECONDS || durationRaw > SHORTS_MAX_SECONDS) {
    return {
      ok: false,
      error: `예상 영상 길이는 ${SHORTS_MIN_SECONDS}~${SHORTS_MAX_SECONDS}초여야 합니다.`,
      field: "estimatedDurationSec",
    };
  }

  const closingLine =
    asNonEmptyString((raw as { closingLine?: unknown }).closingLine) ??
    SHORTS_CLOSING_LINE;

  if (!narration.includes(SHORTS_CLOSING_LINE) && closingLine !== SHORTS_CLOSING_LINE) {
    return {
      ok: false,
      error: `나레이션 또는 closingLine에 마무리 문구("${SHORTS_CLOSING_LINE}")가 포함되어야 합니다.`,
      field: "closingLine",
    };
  }

  return {
    ok: true,
    package: {
      title,
      hook,
      narration,
      scenes,
      articleMediaSuggestions,
      sourceArticles,
      estimatedDurationSec: Math.round(durationRaw),
      closingLine,
    },
  };
}
