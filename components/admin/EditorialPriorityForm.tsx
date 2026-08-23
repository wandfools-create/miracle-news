import {
  EDITORIAL_PRIORITY_OPTIONS,
  normalizeEditorialPriority,
  type EditorialPriority,
} from "@/lib/admin/editorialPriority";

type Props = {
  articleId: string;
  current: EditorialPriority | string | null | undefined;
  action: (formData: FormData) => void | Promise<void>;
  compact?: boolean;
};

export default function EditorialPriorityForm({
  articleId,
  current,
  action,
  compact = false,
}: Props) {
  const value = normalizeEditorialPriority(current);

  return (
    <form
      action={action}
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "flex flex-wrap items-end gap-3"
      }
    >
      <input type="hidden" name="articleId" value={articleId} />
      <label
        className={
          compact
            ? "flex items-center gap-2 text-xs text-gray-700"
            : "text-sm text-gray-800"
        }
      >
        {compact ? null : <span className="mb-1 block font-medium">중요도</span>}
        {compact ? <span className="font-medium">중요도</span> : null}
        <select
          name="editorialPriority"
          defaultValue={value}
          className={
            compact
              ? "rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
              : "mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          }
        >
          {EDITORIAL_PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className={
          compact
            ? "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
            : "rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        }
      >
        저장
      </button>
    </form>
  );
}
