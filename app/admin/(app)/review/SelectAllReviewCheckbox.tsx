"use client";

type Props = {
  targetName: string;
  label?: string;
};

export default function SelectAllReviewCheckbox({
  targetName,
  label = "전체 선택",
}: Props) {
  function handleChange(checked: boolean) {
    const items = document.querySelectorAll<HTMLInputElement>(
      `input[name="${targetName}"]`
    );

    items.forEach((item) => {
      item.checked = checked;
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300"
        onChange={(e) => handleChange(e.target.checked)}
      />
      {label}
    </label>
  );
}