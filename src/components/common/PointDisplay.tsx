import { formatPoint } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type PointDisplayProps = {
  value: number | null | undefined;
  type?: "earn" | "use" | "default";
  pointLabel?: string;
  align?: "left" | "right";
  className?: string;
};

export function PointDisplay({
  value,
  type = "default",
  pointLabel,
  align = "left",
  className,
}: PointDisplayProps) {
  return (
    <span
      className={cn(
        "block tabular-nums font-semibold",
        align === "right" && "text-right",
        type === "earn" && "text-[var(--color-earn-text)]",
        type === "use" && "text-[var(--color-use-text)]",
        type === "default" && "text-[var(--color-slate-900)]",
        className,
      )}
    >
      {formatPoint(value, type, pointLabel)}
    </span>
  );
}
