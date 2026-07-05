import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { AppButton } from "@/components/common/AppButton";
import { cn } from "@/lib/utils";

type AppStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function LoadingState({ title, description, className }: AppStateProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-lg border border-[var(--color-slate-200)] bg-white p-8 text-center",
        className,
      )}
    >
      <Loader2
        className="mx-auto size-6 animate-spin text-[var(--color-primary-600)]"
        aria-hidden="true"
      />
      <h2 className="mt-3 text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
      {description && <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>}
    </section>
  );
}

export function EmptyState({ title, description, action, className }: AppStateProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[var(--color-slate-200)] bg-white p-8 text-center",
        className,
      )}
    >
      <Inbox className="mx-auto size-7 text-[var(--color-slate-400)]" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
      {description && <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </section>
  );
}

type ErrorStateProps = AppStateProps & {
  onRetry?: () => void;
};

export function ErrorState({ title, description, action, onRetry, className }: ErrorStateProps) {
  return (
    <section
      role="alert"
      className={cn(
        "rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-5 text-[var(--color-error-text)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm">{description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && (
              <AppButton type="button" variant="secondary" onClick={onRetry}>
                다시 시도
              </AppButton>
            )}
            {action}
          </div>
        </div>
      </div>
    </section>
  );
}
