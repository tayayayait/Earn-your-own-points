import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";

import { AppButton } from "@/components/common/AppButton";
import { cn } from "@/lib/utils";

type FilterStatusOption = {
  label: string;
  value: string;
};

type FilterBarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  periodValue: string;
  onPeriodChange: (value: string) => void;
  statusOptions?: FilterStatusOption[];
  selectedStatuses?: string[];
  onStatusToggle?: (value: string) => void;
  onReset: () => void;
  searchPlaceholder?: string;
  className?: string;
};

const periodOptions = [
  { label: "7일", value: "7d" },
  { label: "30일", value: "30d" },
  { label: "이번 달", value: "thisMonth" },
  { label: "직접 선택", value: "custom" },
] as const;

export function FilterBar({
  searchValue,
  onSearchChange,
  periodValue,
  onPeriodChange,
  statusOptions = [],
  selectedStatuses = [],
  onStatusToggle,
  onReset,
  searchPlaceholder = "검색",
  className,
}: FilterBarProps) {
  const isDirty = Boolean(searchValue || periodValue || selectedStatuses.length > 0);

  return (
    <div
      className={cn("rounded-lg border border-[var(--color-slate-200)] bg-white p-4", className)}
    >
      <button
        type="button"
        className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--color-slate-200)] px-3 text-sm font-semibold text-[var(--color-slate-700)] md:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        필터
      </button>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1 md:max-w-[420px]">
          <span className="sr-only">{searchPlaceholder}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-slate-500)]"
            aria-hidden="true"
          />
          <input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)] md:min-w-[280px]"
          />
        </label>
        <select
          value={periodValue}
          onChange={(event) => onPeriodChange(event.target.value)}
          aria-label="기간"
          className="h-10 rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
        >
          <option value="">기간</option>
          {periodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {statusOptions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => {
              const selected = selectedStatuses.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onStatusToggle?.(option.value)}
                  className={cn(
                    "min-h-10 rounded-md border px-3 text-sm font-semibold transition-colors",
                    selected
                      ? "border-[var(--color-primary-600)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                      : "border-[var(--color-slate-200)] bg-white text-[var(--color-slate-700)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
        <AppButton
          type="button"
          variant="ghost"
          size="md"
          onClick={onReset}
          disabled={!isDirty}
          className="md:ml-auto"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          초기화
        </AppButton>
      </div>
    </div>
  );
}
