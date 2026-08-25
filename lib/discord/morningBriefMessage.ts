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
  | "article_failed";

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
  extra?: { articleId?: string; error?: string }
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
  } else if (state === "article_failed") {
    lines.push(
      "",
      `❌ 기사 생성 실패${extra?.error ? `: ${extra.error.slice(0, 180)}` : ""}`
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

export function buildMorningBriefComponents(
  candidateId: string,
  originalUrl: string,
  state: MorningBriefMessageState = "active",
  extra?: { articleId?: string }
): DiscordActionRow[] {
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
  extra?: { articleId?: string; error?: string }
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
