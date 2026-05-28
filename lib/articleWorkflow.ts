export const ARTICLE_WORKFLOW = {
  review: {
    status: "ready_for_human_review",
    review_status: "pending",
  },
  revision: {
    status: "needs_revision",
    review_status: "needs_revision",
    revision_status: "requested",
  },
  approved: {
    status: "approved",
    review_status: "approved",
    revision_status: "none",
    is_published: false,
  },
  published: {
    status: "published",
    review_status: "approved",
    is_published: true,
  },
  rejected: {
    status: "rejected",
    review_status: "rejected",
    is_published: false,
  },
} as const;

export const CATEGORY_LABEL_MAP: Record<string, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  religion: "종교",
  other: "기타",
};

export function getCategoryLabel(value: string | null) {
  if (!value) return "미분류";
  return CATEGORY_LABEL_MAP[value] ?? value;
}

export function formatDateTimeKo(value: string | null | undefined) {
  if (!value) return "기록 없음";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}