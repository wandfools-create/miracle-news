import "server-only";

import { isAllowedAdminEmail } from "@/lib/admin/adminEmails";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ShortsAdminContext =
  | { ok: true; email: string }
  | { ok: false; error: string; step: "auth" };

export async function requireShortsAdmin(): Promise<ShortsAdminContext> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user?.email || !isAllowedAdminEmail(user.email)) {
    return {
      ok: false,
      error: "관리자만 Shorts 제작 패키지를 사용할 수 있습니다.",
      step: "auth",
    };
  }

  return { ok: true, email: user.email };
}
