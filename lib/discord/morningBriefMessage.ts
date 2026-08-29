import type { AiRecommendGrade } from "@/lib/collection-candidates/candidateRecommend";
import type { EditorialBeat } from "@/lib/editorialPolicy/signals";
import {
  buildDismissCustomId,
  buildMakeArticleCustomId,
  buildPublishReadyArticleCustomId,
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
  /** Optional desk section from editorial policy. */
  editorialBeat?: EditorialBeat;
  /** One-line DIFFERENT ANGLE / viewpoint note. */
  viewpointNote?: string | null;
};

export type MorningBriefMessageState =
  | "active"
  | "shortlisted"
  | "dismissed"
  | "article_created"
  | "article_failed"
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
    item.aiRecommendGrade === "best"
      ? "⭐ BEST"
      : item.aiRecommendGrade === "priority"
        ? "🔥 우선 검토"
        : item.aiRecommendGrade === "normal"
          ? "📰 일반"
          : "▫️ 낮은 우선순위";
  const sourceLabel = item.feedLabel?.trim() || item.source;
  const published = formatPublishedAtKo(item.rssPublishedAt);
  const reason = item.aiRecommendReason?.trim() || "";
  const section =
    item.editorialBeat === "us_politics_economy"
      ? "미국 정치·경제"
      : item.editorialBeat === "kr_politics_economy"
        ? "한국 정치·경제"
        : item.editorialBeat === "mega_event"
          ? "대형 사건"
          : item.editorialBeat === "foreign_security"
            ? "국제·외교·안보"
            : null;

  const lines = [badge, item.title.trim(), ""];
  if (section) lines.push(`[${section}]`);
  lines.push(`${sourceLabel} · ${published}`);
  if (reason) lines.push(reason);
  if (item.viewpointNote?.trim() && !reason.includes(item.viewpointNote.trim())) {
    lines.push(item.viewpointNote.trim());
  }
  lines.push("", "⚠️ AI 추천 ≠ 자동 공개 · 사람 확인 후 기사화하세요");

  if (state === "shortlisted") {
    lines.push("", "✅ 편집 보관함에 담김");
  } else if (state === "dismissed") {
    lines.push("", "❌ 제외됨");
  } else if (state === "article_created") {
    lines.push("", "✅ 기사 생성 완료 · 빠른 검토에서 확인 후 공개하세요");
    if (extra?.articleId) {
      lines.push(`기사 ID: ${extra.articleId}`);
    }
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

export function buildArticleReadyPayload(input: {
  articleId: string;
  title: string;
  source: string;
  state?: "ready" | "published" | "failed";
  error?: string;
}): { content: string; components: DiscordActionRow[] } {
  const state = input.state ?? "ready";
  const lines = [
    state === "published"
      ? "✅ 공개 완료"
      : state === "failed"
        ? "❌ 공개 실패"
        : "📝 기사화 완료 · 공개 대기",
    input.title.trim(),
    input.source.trim(),
  ];
  if (state === "ready") {
    lines.push("", "관리자가 내용을 확인했다면 아래 버튼으로 바로 공개할 수 있습니다.");
  }
  if (state === "failed" && input.error) lines.push("", input.error.slice(0, 180));

  const components: DiscordActionRow[] = [
    {
      type: 1,
      components: [
        ...(state === "ready"
          ? [{
              type: 2 as const,
              style: 3 as const,
              label: "✅ 바로 공개",
              custom_id: buildPublishReadyArticleCustomId(input.articleId),
            }]
          : []),
        {
          type: 2,
          style: 5,
          label: state === "published" ? "공개 기사 확인" : "빠른 검토 열기",
          url:
            state === "published"
              ? absoluteUrl(`/admin/published?highlight=${encodeURIComponent(input.articleId)}`)
              : quickReviewAdminUrl(input.articleId),
        },
      ],
    },
  ];
  return { content: lines.join("\n"), components };
}
