import * as React from "react";

import { cn } from "@/lib/utils";

type AppInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
};

export const AppInput = React.forwardRef<HTMLInputElement, AppInputProps>(
  ({ id, label, error, helperText, className, containerClassName, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const descriptionId = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-semibold text-[var(--color-slate-700)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={descriptionId}
          className={cn(
            "h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-900)] shadow-sm outline-none transition-colors placeholder:text-[var(--color-slate-500)] focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)] disabled:cursor-not-allowed disabled:bg-[var(--color-slate-50)] disabled:opacity-70",
            error && "border-[var(--color-danger-600)] focus:border-[var(--color-danger-600)]",
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={descriptionId} className="text-xs font-medium text-[var(--color-danger-600)]">
            {error}
          </p>
        ) : helperText ? (
          <p id={descriptionId} className="text-xs text-[var(--color-slate-500)]">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);
AppInput.displayName = "AppInput";
