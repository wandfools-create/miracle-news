import type { AiRecommendGrade } from "@/lib/collection-candidates/candidateRecommend";
import {
  buildDismissCustomId,
  buildMakeArticleCustomId,
  buildShortlistCustomId,
} from "@/lib/discord/allowlist";
import { absoluteUrl } from "@/lib/seo/site";

export type MorningBriefItem = {
  id: string;
  source: string;
  feedLabel: string | null;
  title: string;
  originalUrl: string;
  rssPublishedAt: string | null;
  aiRecommendGrade: AiRecommendGrade;
  aiRecommendScore: number | null;
  aiRecommendReason: string | null;
};

export type MorningBriefMessageState =
  | "active"
  | "shortlisted"
  | "dismissed"
  | "article_created"
  | "article_published"
  | "article_failed"
  | "publish_failed"
  | "same_event_blocked";

function formatPublishedAtKo(iso: string | null): string {
  if (!iso?.trim()) return "발행시각 없음";
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "발행시각 없음";
  }
}

export function quickReviewAdminPath(articleId: string): string {
  return `/admin/quick-review/${articleId}`;
}

export function quickReviewAdminUrl(articleId: string): string {
  return absoluteUrl(quickReviewAdminPath(articleId));
}

export function formatMorningBriefMessageContent(
  item: MorningBriefItem,
  state: MorningBriefMessageState = "active",
  extra?: {
    articleId?: string;
    error?: string;
    sameEventArticleId?: string;
    sameEventTitle?: string;
  }
): string {
  const badge =
    item.aiRecommendGrade === "best" ? "⭐ BEST" : "🔥 우선 검토";
  const sourceLabel = item.feedLabel?.trim() || item.source;
  const published = formatPublishedAtKo(item.rssPublishedAt);
  const reason = item.aiRecommendReason?.trim() || "";

  const lines = [badge, item.title.trim(), "", `${sourceLabel} · ${published}`];
  if (reason) lines.push(reason);

  if (state === "shortlisted") {
    lines.push("", "✅ 편집 보관함에 담김");
  } else if (state === "dismissed") {
    lines.push("", "❌ 제외됨");
  } else if (state === "article_created") {
    lines.push("", "✅ 기사 생성 완료 · 빠른 검토에서 확인 후 공개하세요");
    if (extra?.articleId) {
      lines.push(`기사 ID: ${extra.articleId}`);
    }
  } else if (state === "article_published") {
    lines.push("", "✅ 기사 생성 및 공개 완료");
    if (extra?.articleId) lines.push(`기사 ID: ${extra.articleId}`);
  } else if (state === "publish_failed") {
    lines.push(
      "",
      `⚠️ 기사는 생성했지만 공개하지 못했습니다${
        extra?.error ? `: ${extra.error.slice(0, 180)}` : ""
      }`,
      "빠른 검토에서 확인할 수 있습니다"
    );
  } else if (state === "same_event_blocked") {
    lines.push(
      "",
      "⚠️ 이미 유사한 공개 기사가 있습니다",
      extra?.sameEventTitle?.trim()
        ? extra.sameEventTitle.trim().slice(0, 160)
        : extra?.error?.replace(/^⚠️\s*/, "").slice(0, 160) || ""
    );
  } else if (state === "article_failed") {
    lines.push(
      "",
      `❌ 기사 생성 실패${extra?.error ? `: ${extra.error.slice(0, 180)}` : ""}`,
      "관리자에서 원문 직접 입력 가능"
    );
  }

  return lines.join("\n");
}

export type DiscordMessageComponent =
  | {
      type: 2;
      style: 1 | 3 | 4;
      label: string;
      custom_id: string;
      disabled?: boolean;
    }
  | {
      type: 2;
      style: 5;
      label: string;
      url: string;
    };

export type DiscordActionRow = {
  type: 1;
  components: DiscordMessageComponent[];
};

export function candidateManualPromoteAdminUrl(candidateId: string): string {
  const id = candidateId.trim();
  return absoluteUrl(
    `/admin/collection-candidates?status=enrich_failed&highlight=${encodeURIComponent(id)}`
  );
}

export function buildMorningBriefComponents(
  candidateId: string,
  originalUrl: string,
  state: MorningBriefMessageState = "active",
  extra?: { articleId?: string; sameEventArticleId?: string }
): DiscordActionRow[] {
  if (state === "article_published" && extra?.articleId) {
    return [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "공개 기사 확인·수정",
            url: absoluteUrl(`/admin/review/${extra.articleId}`),
          },
        ],
      },
    ];
  }

  if (state === "publish_failed" && extra?.articleId) {
    return [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "빠른 검토 열기",
            url: quickReviewAdminUrl(extra.articleId),
          },
        ],
      },
    ];
  }

  if (state === "article_created" && extra?.articleId) {
    return [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "빠른 검토 열기",
            url: quickReviewAdminUrl(extra.articleId),
          },
        ],
      },
    ];
  }

  if (state === "same_event_blocked" && extra?.sameEventArticleId) {
    return [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "기존 공개 기사 열기",
            url: absoluteUrl(`/admin/review/${extra.sameEventArticleId}`),
          },
        ],
      },
    ];
  }

  if (state === "article_failed") {
    return [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "관리자에서 원문 직접 입력",
            url: candidateManualPromoteAdminUrl(candidateId),
          },
        ],
      },
    ];
  }

  const disabled = state !== "active";
  const url = originalUrl.trim();
  const actionButtons: DiscordMessageComponent[] = [
    {
      type: 2,
      style: 1,
      label: "📥 편집 보관함",
      custom_id: buildShortlistCustomId(candidateId),
      disabled,
    },
    {
      type: 2,
      style: 3,
      label: "📝 기사 만들기",
      custom_id: buildMakeArticleCustomId(candidateId),
      disabled,
    },
    {
      type: 2,
      style: 4,
      label: "❌ 제외",
      custom_id: buildDismissCustomId(candidateId),
      disabled,
    },
  ];

  if (url.startsWith("http://") || url.startsWith("https://")) {
    actionButtons.push({
      type: 2,
      style: 5,
      label: "🔗 원문 보기",
      url,
    });
  }

  // Discord max 5 components per row — we have at most 4.
  return [{ type: 1, components: actionButtons }];
}

export function buildMorningBriefPayload(
  item: MorningBriefItem,
  state: MorningBriefMessageState = "active",
  extra?: {
    articleId?: string;
    error?: string;
    sameEventArticleId?: string;
    sameEventTitle?: string;
  }
): { content: string; components: DiscordActionRow[] } {
  return {
    content: formatMorningBriefMessageContent(item, state, extra),
    components: buildMorningBriefComponents(
      item.id,
      item.originalUrl,
      state,
      extra
    ),
  };
}
