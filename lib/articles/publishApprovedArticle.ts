import "server-only";

import type { PublishArticleToLiveResult } from "@/lib/articles/publishArticle";
import { publishArticleToLiveInternal } from "@/lib/articles/publishArticle";

/**
 * 승인 완료 큐 전용 공개 entry point.
 * `/admin/approved` 인증된 action에서만 호출한다.
 * quick_review / cron / Discord 경로는 이 함수를 사용하지 않는다.
 */
export async function publishApprovedArticleToLive(
  articleId: string
): Promise<PublishArticleToLiveResult> {
  return publishArticleToLiveInternal(articleId, {
    approvedHumanPublish: true,
  });
}
