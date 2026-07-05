import * as React from "react";

import { cn } from "@/lib/utils";

type AppTableColumn<TData> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: TData) => React.ReactNode;
  className?: string;
};

type AppTableProps<TData> = {
  columns: AppTableColumn<TData>[];
  data: TData[];
  getRowKey: (row: TData) => React.Key;
  emptyMessage?: string;
  stickyHeader?: boolean;
  className?: string;
};

const alignClassNames = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function AppTable<TData>({
  columns,
  data,
  getRowKey,
  emptyMessage = "표시할 데이터가 없습니다.",
  stickyHeader = data.length >= 20,
  className,
}: AppTableProps<TData>) {
  return (
    <div className={cn("w-full", className)}>
      <div className="hidden overflow-auto rounded-lg border border-[var(--color-slate-200)] bg-white md:block">
        <table className="w-full border-collapse text-sm">
          <thead className={cn("bg-[var(--color-slate-50)]", stickyHeader && "sticky top-0 z-10")}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "h-10 px-3 text-xs font-semibold text-[var(--color-slate-500)]",
                    alignClassNames[column.align ?? "left"],
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="h-24 px-3 text-center text-[var(--color-slate-500)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={getRowKey(row)} className="border-t border-[var(--color-slate-200)]">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "h-11 px-3 text-[13px] text-[var(--color-slate-700)]",
                        alignClassNames[column.align ?? "left"],
                        column.align === "right" && "tabular-nums",
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {data.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-slate-200)] bg-white p-6 text-center text-sm text-[var(--color-slate-500)]">
            {emptyMessage}
          </div>
        ) : (
          data.map((row) => (
            <div
              key={getRowKey(row)}
              className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4"
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  className="flex min-h-8 items-start justify-between gap-4 py-1"
                >
                  <span className="text-xs font-semibold text-[var(--color-slate-500)]">
                    {column.header}
                  </span>
                  <span
                    className={cn(
                      "text-sm text-[var(--color-slate-700)]",
                      column.align === "right" && "tabular-nums text-right",
                    )}
                  >
                    {column.render(row)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
