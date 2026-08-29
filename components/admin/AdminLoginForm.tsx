"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import {
  authenticateAdminWithTimeout,
  resolveAdminLoginDestination,
  shouldNavigateAfterAdminLogin,
} from "@/lib/admin/adminLoginAuth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const attemptRef = useRef(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);
    setPending(true);
    const attemptId = ++attemptRef.current;

    try {
      const auth = await authenticateAdminWithTimeout({
        signIn: async () => {
          const supabase = createSupabaseBrowserClient();
          return supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
        },
      });

      if (
        !shouldNavigateAfterAdminLogin({
          ok: auth.ok,
          timedOut: auth.timedOut,
          attemptId,
          currentAttemptId: attemptRef.current,
        })
      ) {
        if (!auth.ok) setError(auth.error);
        return;
      }

      router.push(resolveAdminLoginDestination(searchParams.get("next")));
      router.refresh();
    } catch {
      setError(
        "로그인 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label
          htmlFor="admin-email"
          className="block text-sm font-medium text-gray-700"
        >
          이메일
        </label>
        <input
          id="admin-email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
          placeholder="admin@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="admin-password"
          className="block text-sm font-medium text-gray-700"
        >
          비밀번호
        </label>
        <input
          id="admin-password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
