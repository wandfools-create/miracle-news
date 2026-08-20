import { ARTICLE_BODY_MAX_CHARS } from "../constants";

export function normalizeBody(
  text: string,
  maxLen = ARTICLE_BODY_MAX_CHARS
): string {
  const plain = text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1)}…`;
}
