function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getAllowedAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = getAllowedAdminEmails();
  if (allowed.size === 0) return false;
  return allowed.has(normalizeEmail(email));
}
