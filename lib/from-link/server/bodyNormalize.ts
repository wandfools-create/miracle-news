import { ARTICLE_BODY_MAX_CHARS } from "../constants";

function collapseInlineWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalize article plain text while preserving real paragraph breaks.
 * - Blank lines (`\n\n`) stay as paragraph separators.
 * - Single `\n` between substantive lines (≥40 chars) become paragraphs
 *   (AP JSON-LD / preview often uses single newlines between grafs).
 * - Soft wraps inside a short block collapse to spaces.
 */
export function splitBodyParagraphs(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
  if (!cleaned) return [];

  const blankSeparated = cleaned
    .split(/\n\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => collapseInlineWhitespace(line))
        .filter(Boolean)
        .join(" ")
    )
    .map((p) => p.trim())
    .filter(Boolean);

  if (blankSeparated.length >= 2) {
    return blankSeparated;
  }

  const only = blankSeparated[0] ?? "";
  if (!only) return [];

  const lines = only
    .split("\n")
    .map((line) => collapseInlineWhitespace(line))
    .filter(Boolean);

  const substantive = lines.filter((line) => line.length >= 40);
  if (lines.length >= 2 && substantive.length >= 2) {
    return lines;
  }

  return [lines.join(" ").trim()].filter(Boolean);
}

export function normalizeBody(
  text: string,
  maxLen = ARTICLE_BODY_MAX_CHARS
): string {
  const paragraphs = splitBodyParagraphs(text);
  const plain = paragraphs.join("\n\n").trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1)}…`;
}
