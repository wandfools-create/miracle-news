import {
  getEditorialPriorityBadgeClassName,
  getEditorialPriorityBadgeLabel,
} from "@/lib/admin/editorialPriority";

export default function EditorialPriorityBadge({
  value,
  className = "",
}: {
  value: unknown;
  className?: string;
}) {
  const label = getEditorialPriorityBadgeLabel(value);
  const tone = getEditorialPriorityBadgeClassName(value);
  if (!label || !tone) return null;

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-[11px] ${tone} ${className}`}
    >
      {label}
    </span>
  );
}
