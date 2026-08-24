"use client";

import { useLayoutEffect } from "react";

import {
  buildScrollHash,
  CC_SCROLL_HASH_PREFIX,
  CC_SCROLL_STORAGE_KEY,
  readScrollYFromHash,
} from "@/lib/collection-candidates/candidateListScroll";

function readSavedScrollY(): number | null {
  try {
    const fromHash = readScrollYFromHash(window.location.hash || "");
    if (fromHash != null) return fromHash;
    const raw = sessionStorage.getItem(CC_SCROLL_STORAGE_KEY);
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  } catch {
    return null;
  }
}

function writeSavedScrollY(y: number) {
  const value = String(Math.max(0, Math.round(y)));
  try {
    sessionStorage.setItem(CC_SCROLL_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  document
    .querySelectorAll<HTMLInputElement>('input[name="scrollY"]')
    .forEach((el) => {
      el.value = value;
    });
}

function clearSavedScrollY() {
  try {
    sessionStorage.removeItem(CC_SCROLL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (window.location.hash.startsWith(`#${CC_SCROLL_HASH_PREFIX}`)) {
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", url);
  }
}

function applyScrollY(y: number) {
  window.scrollTo(0, y);
  document.documentElement.scrollTop = y;
  document.body.scrollTop = y;
}

/**
 * Preserves scroll across candidate status mutations (shortlist / dismiss / expire).
 * Clears saved scroll when the user navigates via filter/view tabs.
 */
export default function CandidateListScrollRestore() {
  useLayoutEffect(() => {
    const y = readSavedScrollY();
    if (y == null) return;

    applyScrollY(y);
    const timers = [0, 50, 120, 250, 500].map((ms) =>
      window.setTimeout(() => applyScrollY(y), ms)
    );
    const raf = requestAnimationFrame(() => applyScrollY(y));

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useLayoutEffect(() => {
    function onSubmitCapture(e: Event) {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.getAttribute("data-cc-filter-nav") === "1") {
        clearSavedScrollY();
        return;
      }
      if (!form.closest("[data-cc-workbench]")) return;
      writeSavedScrollY(window.scrollY);
    }

    function onClickCapture(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const filterLink = target.closest<HTMLAnchorElement>(
        'a[data-cc-filter-nav="1"]'
      );
      if (filterLink) {
        clearSavedScrollY();
        return;
      }

      const submitter = target.closest(
        "[data-cc-workbench] button[type='submit'], [data-cc-workbench] input[type='submit']"
      );
      if (submitter) {
        writeSavedScrollY(window.scrollY);
      }
    }

    document.addEventListener("submit", onSubmitCapture, true);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      document.removeEventListener("submit", onSubmitCapture, true);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  return null;
}

/** Call before programmatic bulk server actions. */
export function preserveCandidateListScrollNow() {
  if (typeof window === "undefined") return;
  writeSavedScrollY(window.scrollY);
}

export function candidateListScrollHashFor(y: number): string {
  return buildScrollHash(y);
}
