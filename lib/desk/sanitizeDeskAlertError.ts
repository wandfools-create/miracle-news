const SECRET_PATTERNS = [
  /Bearer\s+\S+/gi,
  /CRON_SECRET/gi,
  /OPENAI/gi,
  /SUPABASE_SERVICE/gi,
  /sk-[a-zA-Z0-9]+/g,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
];

/** Safe one-line error for Discord ops alerts (no secrets / full stack). */
export function sanitizeDeskAlertError(raw: string, maxLen = 120): string {
  let text = raw.trim().split("\n")[0]?.trim() ?? "unknown error";
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen - 1)}…`;
  }
  return text;
}
