import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type AppButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type AppButtonSize = "sm" | "md" | "lg";

type AppButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  loadingLabel?: string;
};

const variantClassNames: Record<AppButtonVariant, string> = {
  primary: "bg-[var(--color-primary-600)] text-white shadow-sm hover:bg-[var(--color-primary-700)]",
  secondary:
    "border border-[var(--color-slate-200)] bg-white text-[var(--color-slate-700)] shadow-sm hover:bg-[var(--color-slate-50)]",
  ghost: "bg-transparent text-[var(--color-slate-700)] hover:bg-[var(--color-slate-100)]",
  danger: "bg-[var(--color-danger-600)] text-white shadow-sm hover:bg-[var(--color-danger-600)]/90",
  success: "bg-[var(--color-accent-500)] text-white shadow-sm hover:bg-[var(--color-accent-700)]",
};

const sizeClassNames: Record<AppButtonSize, string> = {
  sm: "min-h-11 min-w-11 px-3 text-xs",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-[15px]",
};

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  (
    {
      asChild = false,
      variant = "primary",
      size = "md",
      loading = false,
      loadingLabel = "처리 중",
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex min-w-20 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-600)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-[0.45]",
          variantClassNames[variant],
          sizeClassNames[size],
          loading && "cursor-wait",
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading ? "true" : undefined}
        {...props}
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        <span>{loading ? loadingLabel : children}</span>
      </Comp>
    );
  },
);
AppButton.displayName = "AppButton";
