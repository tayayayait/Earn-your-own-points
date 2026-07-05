import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AppModalSize = "sm" | "md" | "lg" | "xl";

type AppModalFrameProps = {
  title: string;
  description?: string;
  size?: AppModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

type AppModalProps = AppModalFrameProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const modalSizeClassNames: Record<AppModalSize, string> = {
  sm: "max-w-[400px]",
  md: "max-w-[560px]",
  lg: "max-w-[720px]",
  xl: "max-w-[960px]",
};

export function AppModal({ open, onOpenChange, ...frameProps }: AppModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0 max-sm:h-screen max-sm:max-w-none max-sm:rounded-none sm:rounded-lg",
          modalSizeClassNames[frameProps.size ?? "md"],
        )}
      >
        <section
          className={cn(
            "flex w-full flex-col bg-white",
            modalSizeClassNames[frameProps.size ?? "md"],
            frameProps.className,
          )}
          aria-label={frameProps.title}
        >
          <DialogHeader className="border-b border-[var(--color-slate-200)] px-6 py-4 text-left">
            <DialogTitle className="text-lg font-bold text-[var(--color-slate-900)]">
              {frameProps.title}
            </DialogTitle>
            {frameProps.description && (
              <DialogDescription>{frameProps.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="max-h-[calc(100vh-180px)] overflow-y-auto overscroll-contain px-6 py-5 text-sm text-[var(--color-slate-700)]">
            {frameProps.children}
          </div>
          {frameProps.footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-slate-200)] px-6 py-4 sm:flex-row sm:justify-end">
              {frameProps.footer}
            </div>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function AppModalFrame({
  title,
  description,
  size = "md",
  children,
  footer,
  className,
}: AppModalFrameProps) {
  return (
    <section
      className={cn("flex w-full flex-col bg-white", modalSizeClassNames[size], className)}
      aria-label={title}
    >
      <header className="border-b border-[var(--color-slate-200)] px-6 py-4 text-left">
        <h2 className="text-lg font-bold text-[var(--color-slate-900)]">{title}</h2>
        {description && <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>}
      </header>
      <div className="max-h-[calc(100vh-180px)] overflow-y-auto overscroll-contain px-6 py-5 text-sm text-[var(--color-slate-700)]">
        {children}
      </div>
      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-slate-200)] px-6 py-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      )}
    </section>
  );
}
