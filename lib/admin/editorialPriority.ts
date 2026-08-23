import {
  EDITORIAL_PRIORITIES,
  normalizeEditorialPriority,
  type EditorialPriority,
} from "@/lib/home/articleFreshness";

export type { EditorialPriority };

export const EDITORIAL_PRIORITY_OPTIONS: Array<{
  value: EditorialPriority;
  label: string;
}> = [
  { value: "normal", label: "일반" },
  { value: "issue", label: "이슈" },
  { value: "special", label: "특집" },
  { value: "breaking", label: "특보" },
];

/** Badge / list label. normal returns null (no emphasis). */
export function getEditorialPriorityBadgeLabel(
  value: unknown
): string | null {
  const priority = normalizeEditorialPriority(value);
  switch (priority) {
    case "breaking":
      return "특보";
    case "special":
      return "특집";
    case "issue":
      return "주요 이슈";
    default:
      return null;
  }
}

export function getEditorialPriorityBadgeClassName(
  value: unknown
): string | null {
  const priority = normalizeEditorialPriority(value);
  switch (priority) {
    case "breaking":
      return "bg-red-100 text-red-800";
    case "special":
      return "bg-amber-100 text-amber-900";
    case "issue":
      return "bg-sky-100 text-sky-900";
    default:
      return null;
  }
}

export { EDITORIAL_PRIORITIES, normalizeEditorialPriority };
