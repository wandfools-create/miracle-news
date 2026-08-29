/**
 * Admin login auth fixtures — no Supabase / secrets.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_LOGIN_INVALID_CREDENTIALS,
  ADMIN_LOGIN_NETWORK_ERROR,
  ADMIN_LOGIN_TIMEOUT_ERROR,
  authenticateAdminWithTimeout,
  resolveAdminLoginDestination,
  shouldNavigateAfterAdminLogin,
} from "./adminLoginAuth";

describe("authenticateAdminWithTimeout", () => {
  it("succeeds when signIn returns no error", async () => {
    const result = await authenticateAdminWithTimeout({
      signIn: async () => ({ error: null }),
      timeoutMs: 5_000,
    });
    assert.deepEqual(result, { ok: true, timedOut: false });
  });

  it("maps Invalid login credentials", async () => {
    const result = await authenticateAdminWithTimeout({
      signIn: async () => ({
        error: { message: "Invalid login credentials" },
      }),
      timeoutMs: 5_000,
    });
    assert.deepEqual(result, {
      ok: false,
      timedOut: false,
      error: ADMIN_LOGIN_INVALID_CREDENTIALS,
    });
  });

  it("maps network reject to Korean network error", async () => {
    const result = await authenticateAdminWithTimeout({
      signIn: async () => {
        throw new Error("fetch failed");
      },
      timeoutMs: 5_000,
    });
    assert.deepEqual(result, {
      ok: false,
      timedOut: false,
      error: ADMIN_LOGIN_NETWORK_ERROR,
    });
  });

  it("times out with Korean error and timedOut flag", async () => {
    const result = await authenticateAdminWithTimeout({
      signIn: () => new Promise(() => {}),
      timeoutMs: 40,
    });
    assert.deepEqual(result, {
      ok: false,
      timedOut: true,
      error: ADMIN_LOGIN_TIMEOUT_ERROR,
    });
  });

  it("late success after timeout does not count as navigable ok", async () => {
    let resolveSignIn!: (value: { error: null }) => void;
    const signInPromise = new Promise<{ error: null }>((resolve) => {
      resolveSignIn = resolve;
    });

    const authPromise = authenticateAdminWithTimeout({
      signIn: () => signInPromise,
      timeoutMs: 30,
    });

    const timedOut = await authPromise;
    assert.equal(timedOut.timedOut, true);
    assert.equal(timedOut.ok, false);

    // Late success must not unlock navigation.
    resolveSignIn({ error: null });
    assert.equal(
      shouldNavigateAfterAdminLogin({
        ok: true,
        timedOut: true,
        attemptId: 1,
        currentAttemptId: 1,
      }),
      false
    );
  });
});

describe("shouldNavigateAfterAdminLogin", () => {
  it("allows only matching non-timed-out success", () => {
    assert.equal(
      shouldNavigateAfterAdminLogin({
        ok: true,
        timedOut: false,
        attemptId: 2,
        currentAttemptId: 2,
      }),
      true
    );
    assert.equal(
      shouldNavigateAfterAdminLogin({
        ok: true,
        timedOut: true,
        attemptId: 2,
        currentAttemptId: 2,
      }),
      false
    );
    assert.equal(
      shouldNavigateAfterAdminLogin({
        ok: true,
        timedOut: false,
        attemptId: 1,
        currentAttemptId: 2,
      }),
      false
    );
  });
});

describe("resolveAdminLoginDestination", () => {
  it("keeps safe admin next paths and rejects login loop", () => {
    assert.equal(resolveAdminLoginDestination("/admin/review"), "/admin/review");
    assert.equal(resolveAdminLoginDestination("/admin/login"), "/admin");
    assert.equal(resolveAdminLoginDestination("/ko"), "/admin");
    assert.equal(resolveAdminLoginDestination(null), "/admin");
  });
});

describe("AdminLoginForm wiring", () => {
  it("uses shared browser client, try/finally pending, and navigation guard", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/AdminLoginForm.tsx"),
      "utf8"
    );
    assert.match(src, /createSupabaseBrowserClient/);
    assert.match(src, /authenticateAdminWithTimeout/);
    assert.match(src, /shouldNavigateAfterAdminLogin/);
    assert.match(src, /finally\s*\{/);
    assert.match(src, /setPending\(false\)/);
    assert.doesNotMatch(src, /createBrowserClient\(/);
    assert.doesNotMatch(src, /console\.(log|info|debug|error|warn)/);
  });
});
