import "server-only";

import { detectContentLanguage } from "./detectContentLanguage";
import { extractArticleBodyFromHtml } from "./server/extractArticleBody";
import { extractPublishedAtFromHtml } from "./extractPublishedAt";
import { fetchPageHtmlForExtraction } from "./fetchPageContent";
import { decodeHtmlEntities } from "./htmlText";
import type { ExtractedPreview, LinkType } from "./types";
import {
  fetchYouTubeTranscript,
  fetchYouTubeWatchHtml,
  parseYouTubeVideoId,
} from "./youtubeTranscript";

const TRANSCRIPT_PREVIEW_LEN = 2000;

function emptyPreview(url: string, note: string | null): ExtractedPreview {
  return {
    title: null,
    description: null,
    siteName: null,
    thumbnailUrl: null,
    bodySnippet: null,
    articleBodyPlain: null,
    articleBodyExtractMethod: null,
    articleBodyExtractSuccess: false,
    pageFetchMethod: null,
    publishedAt: null,
    contentLanguage: "unknown",
    author: null,
    rawUrl: url,
    submittedOriginalUrl: url,
    extractNote: note,
    youtubeTranscript: null,
    youtubeTranscriptLanguage: null,
    youtubeTranscriptAuto: false,
  };
}

function readMetaContent(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  if (!m?.[1]) return null;
  return decodeHtmlEntities(m[1].trim()) || null;
}

function transcriptPreview(text: string): string {
  if (text.length <= TRANSCRIPT_PREVIEW_LEN) return text;
  return `${text.slice(0, TRANSCRIPT_PREVIEW_LEN - 1)}…`;
}

function buildBodySnippet(articleBody: string | null): string | null {
  if (!articleBody?.trim()) return null;
  const plain = articleBody.trim();
  if (plain.length <= 1200) return plain;
  return `${plain.slice(0, 1199)}…`;
}

function enrichExtractedFromHtml(
  base: Omit<
    ExtractedPreview,
    | "publishedAt"
    | "contentLanguage"
    | "articleBodyPlain"
    | "articleBodyExtractMethod"
    | "articleBodyExtractSuccess"
    | "pageFetchMethod"
    | "bodySnippet"
    | "submittedOriginalUrl"
  > & {
    submittedOriginalUrl?: string;
    title?: string | null;
    pageFetchMethod?: "http" | "playwright" | null;
    extractionStats?: ExtractedPreview["extractionStats"];
  },
  html: string,
  pageUrl: string
): ExtractedPreview {
  const extraction = extractArticleBodyFromHtml(html, pageUrl, {
    pageFetchMethod: base.pageFetchMethod ?? null,
  });
  const articleBodyExtractSuccess = extraction.success;
  const articleBodyPlain = extraction.body;
  const articleBodyExtractMethod = extraction.method;

  const title =
    base.title?.trim() ||
    extraction.jsonLd.headline?.trim() ||
    null;

  const publishedAt =
    extractPublishedAtFromHtml(html) ||
    extraction.jsonLd.datePublished ||
    null;

  let extractNote = base.extractNote;
  if (base.pageFetchMethod === "playwright" && articleBodyExtractSuccess) {
    extractNote = [
      extractNote,
      "JavaScript 렌더링(Playwright)으로 페이지를 연 뒤 본문을 추출했습니다.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (!articleBodyExtractSuccess) {
    extractNote = [
      extractNote,
      "본문 추출 실패: 일반 fetch·Playwright 렌더링 모두로 본문을 확보하지 못했습니다. og:description만으로는 기사를 생성하지 않습니다. 아래 「원문 보강 텍스트」에 기사 전문을 붙여 넣거나 다른 URL을 시도해 주세요.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const bodySnippet = buildBodySnippet(articleBodyPlain);
  const langSample = [title, articleBodyPlain].filter(Boolean).join("\n");

  return {
    ...base,
    title,
    submittedOriginalUrl: base.submittedOriginalUrl ?? base.rawUrl,
    articleBodyPlain,
    articleBodyExtractMethod,
    articleBodyExtractSuccess,
    pageFetchMethod: base.pageFetchMethod ?? null,
    extractionStats: base.extractionStats,
    bodySnippet,
    extractNote: extractNote ?? null,
    publishedAt,
    contentLanguage: detectContentLanguage(langSample),
  };
}

async function extractFromHtmlPage(pageUrl: string): Promise<ExtractedPreview> {
  const doc = await fetchPageHtmlForExtraction(pageUrl);
  if (!doc.html) {
    console.warn("[from-link/extract] page fetch failed (HTTP + Playwright)", {
      url: pageUrl,
      step: "fetch-page-content",
      status: doc.status,
      error: doc.error,
    });
    return emptyPreview(
      pageUrl,
      doc.error
        ? `페이지를 가져오지 못했습니다 (${doc.error}). URL·차단 여부를 확인하거나 원문 보강 텍스트를 붙여 주세요.`
        : "페이지를 가져오지 못했습니다. 원문 보강 텍스트를 붙이거나 다른 URL을 시도해 주세요."
    );
  }

  const html = doc.html;

  let redirectNote: string | null = null;
  if (doc.finalUrl && doc.finalUrl !== pageUrl) {
    redirectNote =
      "페이지 응답 URL이 입력 URL과 다를 수 있습니다. 저장·원문 링크는 입력하신 URL만 사용합니다.";
  }

  const title =
    readMetaContent(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["'][^>]*>/i
    ) ||
    readMetaContent(html, /<title[^>]*>([^<]*)<\/title>/i);

  const description =
    readMetaContent(
      html,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
    );

  const siteName = readMetaContent(
    html,
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["'][^>]*>/i
  );

  const thumbnailUrl =
    readMetaContent(
      html,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["'][^>]*>/i
    );

  return enrichExtractedFromHtml(
    {
      title: title?.trim() || null,
      description: description?.trim() || null,
      siteName: siteName?.trim() || null,
      thumbnailUrl: thumbnailUrl?.trim() || null,
      author: null,
      rawUrl: pageUrl,
      submittedOriginalUrl: pageUrl,
      extractNote: redirectNote,
      pageFetchMethod: doc.pageFetchMethod,
      extractionStats: doc.extractionStats,
      youtubeTranscript: null,
      youtubeTranscriptLanguage: null,
      youtubeTranscriptAuto: false,
    },
    html,
    doc.finalUrl || pageUrl
  );
}

function extractYouTubeMetaFromHtml(
  html: string
): Pick<ExtractedPreview, "title" | "description" | "thumbnailUrl"> {
  const title =
    readMetaContent(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["'][^>]*>/i
    ) ||
    readMetaContent(html, /<title[^>]*>([^<]*)<\/title>/i);

  const description =
    readMetaContent(
      html,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i
    );

  const thumbnailUrl =
    readMetaContent(
      html,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["'][^>]*>/i
    ) ||
    readMetaContent(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["'][^>]*>/i
    );

  return {
    title: title?.trim() || null,
    description: description?.trim() || null,
    thumbnailUrl: thumbnailUrl?.trim() || null,
  };
}

async function extractYouTube(pageUrl: string): Promise<ExtractedPreview> {
  const videoId = parseYouTubeVideoId(pageUrl);
  const watchHtml = videoId ? await fetchYouTubeWatchHtml(videoId) : null;

  let title: string | null = null;
  let author: string | null = null;
  let thumbnailUrl: string | null = null;
  let description: string | null = null;

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    pageUrl
  )}&format=json`;
  try {
    const res = await fetch(oembedUrl, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      title = data.title?.trim() || null;
      author = data.author_name?.trim() || null;
      thumbnailUrl = data.thumbnail_url?.trim() || null;
    }
  } catch {
    /* oEmbed optional */
  }

  if (watchHtml) {
    const meta = extractYouTubeMetaFromHtml(watchHtml);
    if (!title && meta.title) title = meta.title;
    if (!thumbnailUrl && meta.thumbnailUrl) thumbnailUrl = meta.thumbnailUrl;
    if (
      meta.description &&
      meta.description.length > (description ?? "").length
    ) {
      description = meta.description;
    }
  }

  if (videoId && watchHtml) {
    const transcript = await fetchYouTubeTranscript(pageUrl, watchHtml);
    if (transcript.ok) {
      const langLabel = transcript.languageCode;
      const autoLabel = transcript.isAutoGenerated
        ? "자동 생성 자막"
        : "제공 자막";
      const publishedAt = extractPublishedAtFromHtml(watchHtml);
      const transcriptLang = transcript.languageCode.toLowerCase();
      const contentLanguage =
        transcriptLang.startsWith("ko")
          ? "ko"
          : transcriptLang.startsWith("en")
            ? "en"
            : detectContentLanguage(transcript.text);

      return {
        title,
        description:
          description ||
          `YouTube ${autoLabel} (${langLabel}, ${transcript.text.length.toLocaleString("ko-KR")}자)`,
        siteName: "YouTube",
        thumbnailUrl,
        bodySnippet: transcriptPreview(transcript.text),
        articleBodyPlain: transcript.text,
        articleBodyExtractMethod: "youtube-transcript",
        articleBodyExtractSuccess: true,
        publishedAt,
        contentLanguage,
        author,
        rawUrl: pageUrl,
        submittedOriginalUrl: pageUrl,
        extractNote: `영상 자막(${langLabel}, ${autoLabel})을 기준으로 기사 초안을 만듭니다.`,
        youtubeTranscript: transcript.text,
        youtubeTranscriptLanguage: transcript.languageCode,
        youtubeTranscriptAuto: transcript.isAutoGenerated,
      };
    }

    const metaFallbackNote = transcript.reason.includes("찾지 못했")
      ? transcript.reason
      : `영상 자막을 찾지 못했습니다. ${transcript.reason}`;

    const metaBody = joinMetaFallbackBody(description, null);
    const publishedAt = extractPublishedAtFromHtml(watchHtml);
    const langSample = [title, description, metaBody].filter(Boolean).join("\n");

    return {
      title,
      description,
      siteName: "YouTube",
      thumbnailUrl,
      bodySnippet: metaBody ? metaBody.slice(0, TRANSCRIPT_PREVIEW_LEN) : null,
      articleBodyPlain: metaBody,
      articleBodyExtractMethod: "youtube-meta-fallback",
      articleBodyExtractSuccess: false,
      publishedAt,
      contentLanguage: detectContentLanguage(langSample),
      author,
      rawUrl: pageUrl,
      submittedOriginalUrl: pageUrl,
      extractNote: `${metaFallbackNote} 자막이 없을 때만 제목·설명 등 메타 정보로 시도합니다.`,
      youtubeTranscript: null,
      youtubeTranscriptLanguage: null,
      youtubeTranscriptAuto: false,
    };
  }

  return {
    ...emptyPreview(pageUrl, "YouTube 페이지를 불러오지 못했습니다."),
    title,
    description,
    thumbnailUrl,
    author,
    siteName: "YouTube",
  };
}

function joinMetaFallbackBody(
  description: string | null,
  pageText: string | null
): string | null {
  const parts = [description, pageText].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  if (!parts.length) return null;
  return parts.join("\n\n").trim();
}

export async function extractContent(
  linkType: LinkType,
  pageUrl: string
): Promise<ExtractedPreview> {
  if (linkType === "youtube") {
    return extractYouTube(pageUrl);
  }

  if (linkType === "x" || linkType === "instagram") {
    const preview = await extractFromHtmlPage(pageUrl);
    if (!preview.title && !preview.description && !preview.bodySnippet) {
      return {
        ...preview,
        extractNote:
          preview.extractNote ||
          "X/Instagram은 로그인·봇 차단으로 텍스트를 거의 가져오지 못한 경우가 많습니다. 이 상태에서는 기사형 요약을 만들 수 없을 수 있습니다.",
      };
    }
    return preview;
  }

  if (linkType === "video") {
    return emptyPreview(
      pageUrl,
      "직접 영상 파일 URL은 본문 텍스트를 추출할 수 없어 기사 초안으로 사용하지 않습니다."
    );
  }

  return extractFromHtmlPage(pageUrl);
}
