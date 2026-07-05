import { getStatusMeta, type StatusTone } from "@/lib/enums";
import { cn } from "@/lib/utils";

type StatusBadgeType = "customer" | "transaction" | "transactionType" | "policy";

type StatusBadgeProps = {
  status: string;
  type: StatusBadgeType;
  className?: string;
};

const toneClassNames: Record<StatusTone, string> = {
  success: "bg-[var(--color-earn-bg)] text-[var(--color-earn-text)]",
  warning: "bg-[var(--color-pending-bg)] text-[var(--color-pending-text)]",
  neutral: "bg-[var(--color-cancel-bg)] text-[var(--color-cancel-text)]",
  danger: "bg-[var(--color-use-bg)] text-[var(--color-use-text)]",
  info: "bg-[var(--color-primary-50)] text-[var(--color-info-600)]",
};

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const meta = getStatusMeta(type, status);

  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-semibold leading-none",
        toneClassNames[meta.tone],
        className,
      )}
      aria-label={meta.label}
    >
      {meta.label}
    </span>
  );
}
