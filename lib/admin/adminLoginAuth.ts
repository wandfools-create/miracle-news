/**
 * Admin login helpers — UI timeout + error mapping (no secrets logged).
 * Does not change the shared Supabase browser client.
 */

export const ADMIN_LOGIN_AUTH_TIMEOUT_MS = 15_000;

export const ADMIN_LOGIN_TIMEOUT_ERROR =
  "로그인 요청이 시간 초과되었습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.";

export const ADMIN_LOGIN_NETWORK_ERROR =
  "로그인 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

export const ADMIN_LOGIN_INVALID_CREDENTIALS =
  "이메일 또는 비밀번호가 올바르지 않습니다.";

export type AdminSignInResult = {
  error: { message: string } | null;
};

export type AdminLoginAuthOutcome =
  | { ok: true; timedOut: false }
  | { ok: false; timedOut: boolean; error: string };

export function mapAdminLoginErrorMessage(message: string): string {
  if (message === "Invalid login credentials") {
    return ADMIN_LOGIN_INVALID_CREDENTIALS;
  }
  if (message === "LOGIN_TIMEOUT" || /timeout|timed out/i.test(message)) {
    return ADMIN_LOGIN_TIMEOUT_ERROR;
  }
  return message;
}

/** Safe admin destination from `?next=` (same rules as login form). */
export function resolveAdminLoginDestination(
  next: string | null | undefined
): string {
  if (
    next &&
    next.startsWith("/admin") &&
    !next.startsWith("/admin/login")
  ) {
    return next;
  }
  return "/admin";
}

/**
 * Race sign-in against a UI timeout. Does not abort the underlying request.
 * Late success after timeout is reported as timedOut (caller must not navigate).
 */
export async function authenticateAdminWithTimeout(input: {
  signIn: () => Promise<AdminSignInResult>;
  timeoutMs?: number;
}): Promise<AdminLoginAuthOutcome> {
  const timeoutMs = input.timeoutMs ?? ADMIN_LOGIN_AUTH_TIMEOUT_MS;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      input.signIn(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          reject(new Error("LOGIN_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);

    if (timedOut) {
      return { ok: false, timedOut: true, error: ADMIN_LOGIN_TIMEOUT_ERROR };
    }

    if (result.error) {
      return {
        ok: false,
        timedOut: false,
        error: mapAdminLoginErrorMessage(result.error.message),
      };
    }
    return { ok: true, timedOut: false };
  } catch (err) {
    if (timedOut || (err instanceof Error && err.message === "LOGIN_TIMEOUT")) {
      return { ok: false, timedOut: true, error: ADMIN_LOGIN_TIMEOUT_ERROR };
    }
    return { ok: false, timedOut: false, error: ADMIN_LOGIN_NETWORK_ERROR };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/** Whether a completed auth attempt may navigate (blocks late post-timeout success). */
export function shouldNavigateAfterAdminLogin(input: {
  ok: boolean;
  timedOut: boolean;
  attemptId: number;
  currentAttemptId: number;
}): boolean {
  return (
    input.ok &&
    !input.timedOut &&
    input.attemptId === input.currentAttemptId
  );
}
