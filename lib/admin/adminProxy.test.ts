import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("admin proxy / middleware hardening (fixture only)", () => {
  it("uses proxy.ts (not middleware.ts) with admin-only matcher", () => {
    const root = process.cwd();
    assert.equal(existsSync(join(root, "middleware.ts")), false);
    assert.equal(existsSync(join(root, "proxy.ts")), true);

    const proxy = readFileSync(join(root, "proxy.ts"), "utf8");
    assert.match(proxy, /export async function proxy/);
    assert.match(proxy, /matcher:\s*\[["']\/admin["'],\s*["']\/admin\/:path\*["']\]/);
    assert.match(proxy, /pathname\.startsWith\(["']\/api\//);
    assert.doesNotMatch(proxy, /from ["']@\/lib\/openai/);
    assert.doesNotMatch(proxy, /collectRss|runMorningBrief|desk-us|desk-kr/);
  });

  it("bounds Supabase getUser with timeout and cookie short-circuit", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/supabase/middleware.ts"),
      "utf8"
    );
    assert.match(src, /AUTH_GET_USER_TIMEOUT_MS/);
    assert.match(src, /supabase_auth_timeout/);
    assert.match(src, /hasSupabaseAuthCookie/);
    assert.match(src, /Promise\.race/);
  });
});
