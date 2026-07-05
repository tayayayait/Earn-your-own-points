import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { CalendarDays, Filter } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  buildAppTransactionFilters,
  defaultTransactionSearch,
  getPublicAppTransactionsData,
  normalizeAppTransactionsResponse,
  type AppTransaction,
  type AppTransactionRpcFilters,
  type AppTransactionSearch,
} from "@/features/app-user/app-data";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;
type AppTransactionsRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_app_transactions", args: AppTransactionRpcFilters): RpcResponse<unknown>;
};

const appTransactionsClient = supabase as unknown as AppTransactionsRpcClient;

export const Route = createFileRoute("/_authenticated/app/transactions")({
  head: () => ({ meta: [{ title: "내역 · 포인트 리워드" }] }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const [search, setSearch] = useState<AppTransactionSearch>(defaultTransactionSearch);
  const transactionsQuery = useQuery({
    queryKey: ["app-transactions", search],
    queryFn: () => fetchTransactions(search),
  });

  function updateSearch(patch: Partial<AppTransactionSearch>) {
    setSearch((current) => ({ ...current, ...patch }));
  }

  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary-700)]">타임라인</p>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">포인트 내역</h1>
        </div>
      </header>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--color-slate-900)]">
          <Filter className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />
          필터
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField
            label="기간"
            value={search.period}
            onChange={(value) => updateSearch({ period: value as AppTransactionSearch["period"] })}
            options={[
              ["1m", "1개월"],
              ["3m", "3개월"],
              ["6m", "6개월"],
              ["custom", "직접 선택"],
            ]}
          />
          <SelectField
            label="유형"
            value={search.type}
            onChange={(value) => updateSearch({ type: value as AppTransactionSearch["type"] })}
            options={[
              ["all", "전체"],
              ["earn", "적립"],
              ["use", "사용"],
              ["expire", "만료"],
              ["cancel", "취소"],
            ]}
          />
          <SelectField
            label="상태"
            value={search.status}
            onChange={(value) => updateSearch({ status: value as AppTransactionSearch["status"] })}
            options={[
              ["all", "전체"],
              ["pending", "예정"],
              ["confirmed", "확정"],
              ["cancelled", "취소"],
            ]}
          />
        </div>
        {search.period === "custom" && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <DateField
              label="시작일"
              value={search.dateFrom}
              onChange={(value) => updateSearch({ dateFrom: value })}
            />
            <DateField
              label="종료일"
              value={search.dateTo}
              onChange={(value) => updateSearch({ dateTo: value })}
            />
          </div>
        )}
      </section>

      {transactionsQuery.isLoading ? (
        <Skeleton className="h-[480px] rounded-lg bg-[var(--color-slate-200)]" />
      ) : transactionsQuery.error ? (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="font-semibold">내역을 불러오지 못했습니다.</div>
          <div className="mt-1">{transactionsQuery.error.message}</div>
        </section>
      ) : (
        <TransactionList transactions={transactions} />
      )}
    </div>
  );
}

function TransactionList({ transactions }: { transactions: AppTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-10 text-center text-sm text-[var(--color-slate-500)]">
        조건에 맞는 포인트 내역이 없습니다.
      </section>
    );
  }

  return (
    <section>
      <div className="hidden overflow-auto rounded-lg border border-[var(--color-slate-200)] bg-white md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--color-slate-50)]">
            <tr>
              {["제목", "날짜", "포인트", "상태", "잔액"].map((header) => (
                <th
                  key={header}
                  className={cn(
                    "h-10 px-3 text-xs font-semibold text-[var(--color-slate-500)]",
                    ["포인트", "잔액"].includes(header) ? "text-right" : "text-left",
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((item) => (
              <tr key={item.id} className="border-t border-[var(--color-slate-200)]">
                <td className="h-12 px-3">
                  <div className="font-semibold text-[var(--color-slate-900)]">{item.title}</div>
                  <div className="text-xs text-[var(--color-slate-500)]">{item.typeLabel}</div>
                </td>
                <td className="px-3 text-[var(--color-slate-600)]">{item.createdAtLabel}</td>
                <td className="px-3 text-right font-bold tabular-nums">{item.amountLabel}</td>
                <td className="px-3">
                  <StatusPill label={item.statusLabel} status={item.status} />
                </td>
                <td className="px-3 text-right font-semibold tabular-nums">
                  {item.balanceAfterLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {transactions.map((item) => (
          <article
            key={item.id}
            className="relative rounded-lg border border-[var(--color-slate-200)] bg-white p-4 pl-6 shadow-sm"
          >
            <span className="absolute left-3 top-5 size-2 rounded-full bg-[var(--color-primary-600)]" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[var(--color-slate-900)]">{item.title}</div>
                <div className="mt-1 text-xs text-[var(--color-slate-500)]">
                  {item.createdAtLabel} · {item.typeLabel}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold tabular-nums">{item.amountLabel}</div>
                <StatusPill label={item.statusLabel} status={item.status} />
              </div>
            </div>
            <div className="mt-3 text-xs text-[var(--color-slate-500)]">
              처리 후 잔액 {item.balanceAfterLabel}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ label, status }: { label: string; status: string }) {
  const tone =
    status === "pending"
      ? "bg-[var(--color-pending-bg)] text-[var(--color-pending-text)]"
      : status === "failed"
        ? "bg-[var(--color-use-bg)] text-[var(--color-use-text)]"
        : "bg-[var(--color-earn-bg)] text-[var(--color-earn-text)]";

  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-bold", tone)}>
      {label}
    </span>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-semibold text-[var(--color-slate-700)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-[var(--color-slate-200)] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-2 focus:ring-[var(--color-primary-50)]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-semibold text-[var(--color-slate-700)]">{label}</span>
      <div className="relative">
        <CalendarDays
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-slate-500)]"
          aria-hidden="true"
        />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-md border border-[var(--color-slate-200)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-2 focus:ring-[var(--color-primary-50)]"
        />
      </div>
    </label>
  );
}

async function fetchTransactions(search: AppTransactionSearch): Promise<AppTransaction[]> {
  if (!(await hasActiveSession())) return getPublicAppTransactionsData(search);

  const { data, error } = await appTransactionsClient.rpc(
    "get_app_transactions",
    buildAppTransactionFilters(search),
  );

  if (error) {
    throw new Error(error.message);
  }

  return normalizeAppTransactionsResponse(data);
}
