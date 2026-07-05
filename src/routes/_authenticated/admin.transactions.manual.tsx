import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { ArrowLeft, Search } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppModal } from "@/components/common/AppModal";
import { PointDisplay } from "@/components/common/PointDisplay";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  buildManualTransactionIdempotencyKey,
  calculateExpectedBalance,
  normalizeManualTransactionContext,
  validateManualTransactionForm,
  type ManualTransactionContext,
  type ManualTransactionType,
} from "@/features/admin-manual-transactions/manual-transaction-data";
import {
  normalizeCustomerOptions,
  type CustomerOption,
} from "@/features/admin-transactions/transaction-list-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";

const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type AdminManualTransactionRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(
    fn: "search_admin_transaction_customers",
    args: { _query: string | null; _limit: number },
  ): RpcResponse<unknown>;
  rpc(fn: "get_admin_manual_transaction_context", args: { _user_id: string }): RpcResponse<unknown>;
  rpc(
    fn: "create_admin_customer_point_transaction",
    args: {
      _user_id: string;
      _type: ManualTransactionType;
      _amount: number;
      _memo: string;
      _idempotency_key: string;
      _expires_at: string | null;
    },
  ): RpcResponse<unknown>;
};

const adminManualClient = supabase as unknown as AdminManualTransactionRpcClient;

export const Route = createFileRoute("/_authenticated/admin/transactions/manual")({
  head: () => ({ meta: [{ title: "수동 지급/차감 · 관리자" }] }),
  component: Page,
});

function Page() {
  const navigate = Route.useNavigate();
  const [customerQuery, setCustomerQuery] = useState("");
  const debouncedCustomerQuery = useDebouncedValue(customerQuery, CUSTOMER_SEARCH_DEBOUNCE_MS);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [type, setType] = useState<ManualTransactionType>("manual_earn");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const customerOptionsQuery = useQuery({
    queryKey: ["admin-manual-transaction-customers", debouncedCustomerQuery],
    queryFn: () => fetchCustomerOptions(debouncedCustomerQuery),
    enabled: debouncedCustomerQuery.trim().length >= 2 && !selectedCustomer,
  });

  const contextQuery = useQuery({
    queryKey: ["admin-manual-transaction-context", selectedCustomer?.id],
    queryFn: () => fetchManualTransactionContext(selectedCustomer?.id ?? ""),
    enabled: Boolean(selectedCustomer?.id),
  });

  const context = contextQuery.data;
  const parsedAmount = parsePointAmount(amount);
  const expectedBalance = useMemo(
    () =>
      calculateExpectedBalance(
        context?.balance.availablePoints ?? 0,
        type,
        Number.isInteger(parsedAmount) ? parsedAmount : 0,
      ),
    [context?.balance.availablePoints, parsedAmount, type],
  );
  const idempotencyKey = buildManualTransactionIdempotencyKey({
    userId: selectedCustomer?.id ?? "",
    type,
    amount: parsedAmount,
    memo,
    expiresAt: type === "manual_earn" ? expiresAt : null,
  });

  const createMutation = useMutation({
    mutationFn: createManualTransaction,
    onSuccess: () => {
      toast.success("수동 포인트 처리가 완료되었습니다.");
      void navigate({ to: "/admin/transactions" });
    },
    onError: (error) => setFormError(error.message),
  });

  useEffect(() => {
    if (type === "manual_earn" && !expiresAt && context?.policy.defaultExpiresAtDate) {
      setExpiresAt(context.policy.defaultExpiresAtDate);
    }
  }, [context?.policy.defaultExpiresAtDate, expiresAt, type]);

  function selectCustomer(option: CustomerOption) {
    setSelectedCustomer(option);
    setCustomerQuery(option.label);
    setFormError(null);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setExpiresAt("");
    setFormError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateManualTransactionForm({
      userId: selectedCustomer?.id ?? "",
      type,
      amount: parsedAmount,
      memo,
      availablePoints: context?.balance.availablePoints ?? 0,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    setConfirmOpen(true);
  }

  function confirmSubmit() {
    if (!selectedCustomer) return;

    createMutation.mutate({
      userId: selectedCustomer.id,
      type,
      amount: parsedAmount,
      memo,
      expiresAt: type === "manual_earn" && expiresAt ? new Date(expiresAt).toISOString() : null,
      idempotencyKey,
    });
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">수동 지급/차감</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            고객의 현재 잔액과 정책 만료일을 확인한 뒤 수동 포인트 거래를 생성합니다.
          </p>
        </div>
        <AppButton
          type="button"
          variant="secondary"
          onClick={() => navigate({ to: "/admin/transactions" })}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          거래 내역
        </AppButton>
      </header>

      <form
        onSubmit={submit}
        className="grid gap-6 rounded-lg border border-[var(--color-slate-200)] bg-white p-6 shadow-sm lg:grid-cols-[minmax(0,1.1fr)_320px]"
      >
        <section className="space-y-5">
          <div className="relative">
            <label className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              고객 검색
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-[38px] size-4 text-[var(--color-slate-500)]"
              aria-hidden="true"
            />
            <input
              value={customerQuery}
              onChange={(event) => {
                setCustomerQuery(event.target.value);
                setSelectedCustomer(null);
              }}
              placeholder="이름, 이메일, 고객 ID"
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            />
            {selectedCustomer && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[var(--color-primary-700)]"
                onClick={clearCustomer}
              >
                선택 해제: {selectedCustomer.label}
              </button>
            )}
            {debouncedCustomerQuery.trim().length >= 2 && !selectedCustomer && (
              <div className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-lg border border-[var(--color-slate-200)] bg-white shadow-lg">
                {customerOptionsQuery.isLoading && (
                  <div className="p-3 text-sm text-[var(--color-slate-500)]">검색 중</div>
                )}
                {!customerOptionsQuery.isLoading &&
                  (customerOptionsQuery.data ?? []).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-slate-50)]"
                      onClick={() => selectCustomer(option)}
                    >
                      <span className="font-semibold text-[var(--color-slate-900)]">
                        {option.label}
                      </span>
                      <span className="block text-xs text-[var(--color-slate-500)]">
                        {option.email || "-"}
                      </span>
                    </button>
                  ))}
                {!customerOptionsQuery.isLoading &&
                  (customerOptionsQuery.data ?? []).length === 0 && (
                    <div className="p-3 text-sm text-[var(--color-slate-500)]">
                      검색 결과가 없습니다.
                    </div>
                  )}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-semibold text-[var(--color-slate-700)]">
                처리 유형
              </span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ManualTransactionType)}
                className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
              >
                <option value="manual_earn">지급</option>
                <option value="manual_deduct">차감</option>
              </select>
            </label>
            <AppInput
              type="number"
              min={1}
              inputMode="numeric"
              label="포인트"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1000"
            />
          </div>

          {type === "manual_earn" && (
            <AppInput
              type="date"
              label="만료일"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              helperText={
                context
                  ? `${context.policy.policyName} 기준 ${context.policy.validMonths || 12}개월 후로 자동 계산됩니다.`
                  : "고객 선택 후 기본 정책 만료일이 자동 입력됩니다."
              }
            />
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="manual-memo"
              className="block text-sm font-semibold text-[var(--color-slate-700)]"
            >
              수동 지급/차감 사유
            </label>
            <Textarea
              id="manual-memo"
              rows={5}
              maxLength={500}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="10자 이상 500자 이하로 처리 사유를 입력하세요."
              className="resize-none"
            />
            <div className="text-right text-xs text-[var(--color-slate-500)]">
              {memo.length.toLocaleString("ko-KR")} / 500
            </div>
          </div>

          {formError && (
            <div className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-3 text-sm font-semibold text-[var(--color-error-text)]">
              {formError}
            </div>
          )}
          <p className="text-xs text-[var(--color-slate-500)]">
            차감 시 보유 포인트보다 많이 차감할 수 없습니다.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => navigate({ to: "/admin/transactions" })}
            >
              취소
            </AppButton>
            <AppButton type="submit">처리 확인</AppButton>
          </div>
        </section>

        <ManualSummary
          context={context}
          loading={contextQuery.isLoading}
          type={type}
          amount={parsedAmount}
          expectedBalance={expectedBalance}
          idempotencyKey={idempotencyKey}
        />
      </form>

      <AppModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="처리 확인"
        description="수동 지급/차감은 취소 대신 별도 정정 거래로 추적됩니다."
        size="md"
        footer={
          <>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={createMutation.isPending}
            >
              닫기
            </AppButton>
            <AppButton
              type="button"
              onClick={confirmSubmit}
              loading={createMutation.isPending}
              loadingLabel="처리 중"
            >
              확정 처리
            </AppButton>
          </>
        }
      >
        <div className="space-y-3">
          <InfoRow label="고객" value={context?.customer.label ?? "-"} />
          <InfoRow label="처리" value={type === "manual_earn" ? "지급" : "차감"} />
          <InfoRow label="포인트" value={`${parsedAmount.toLocaleString("ko-KR")}P`} />
          <InfoRow label="예상 잔액" value={`${expectedBalance.toLocaleString("ko-KR")}P`} />
          <InfoRow label="만료일" value={type === "manual_earn" ? expiresAt || "-" : "-"} />
          <InfoRow label="idempotency" value={idempotencyKey} />
          <div className="rounded-lg bg-[var(--color-slate-50)] p-3 text-sm text-[var(--color-slate-700)]">
            {memo}
          </div>
        </div>
      </AppModal>
    </div>
  );
}

function ManualSummary({
  context,
  loading,
  type,
  amount,
  expectedBalance,
  idempotencyKey,
}: {
  context: ManualTransactionContext | undefined;
  loading: boolean;
  type: ManualTransactionType;
  amount: number;
  expectedBalance: number;
  idempotencyKey: string;
}) {
  if (loading) {
    return <Skeleton className="h-80 rounded-lg bg-[var(--color-slate-200)]" />;
  }

  return (
    <aside className="rounded-lg border border-[var(--color-slate-200)] bg-[var(--color-slate-50)] p-4">
      <h2 className="text-sm font-bold text-[var(--color-slate-900)]">처리 요약</h2>
      <div className="mt-4 space-y-3">
        <InfoRow label="고객" value={context?.customer.label ?? "미선택"} />
        <InfoRow label="상태" value={context?.customer.status ?? "-"} />
        <div className="rounded-lg bg-white p-3">
          <div className="text-xs font-semibold text-[var(--color-slate-500)]">현재 보유</div>
          <PointDisplay
            value={context?.balance.availablePoints ?? null}
            type="default"
            className="mt-1 text-lg"
          />
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="text-xs font-semibold text-[var(--color-slate-500)]">
            {type === "manual_earn" ? "지급 예정" : "차감 예정"}
          </div>
          <PointDisplay
            value={Number.isInteger(amount) ? amount : 0}
            type={type === "manual_earn" ? "earn" : "use"}
            className="mt-1 text-lg"
          />
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="text-xs font-semibold text-[var(--color-slate-500)]">예상 잔액</div>
          <PointDisplay value={expectedBalance} type="default" className="mt-1 text-lg" />
        </div>
        <div className="break-all rounded-lg border border-dashed border-[var(--color-slate-300)] p-3 text-xs text-[var(--color-slate-500)]">
          idempotency: {idempotencyKey || "-"}
        </div>
      </div>
    </aside>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-7 items-start justify-between gap-4 text-sm">
      <span className="shrink-0 font-semibold text-[var(--color-slate-500)]">{label}</span>
      <span className="min-w-0 text-right text-[var(--color-slate-900)]">{value}</span>
    </div>
  );
}

async function fetchCustomerOptions(query: string): Promise<CustomerOption[]> {
  const { data, error } = await adminManualClient.rpc("search_admin_transaction_customers", {
    _query: query.trim() || null,
    _limit: 8,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeCustomerOptions(data);
}

async function fetchManualTransactionContext(userId: string): Promise<ManualTransactionContext> {
  const { data, error } = await adminManualClient.rpc("get_admin_manual_transaction_context", {
    _user_id: userId,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeManualTransactionContext(data);
}

async function createManualTransaction({
  userId,
  type,
  amount,
  memo,
  expiresAt,
  idempotencyKey,
}: {
  userId: string;
  type: ManualTransactionType;
  amount: number;
  memo: string;
  expiresAt: string | null;
  idempotencyKey: string;
}) {
  const { error } = await adminManualClient.rpc("create_admin_customer_point_transaction", {
    _user_id: userId,
    _type: type,
    _amount: amount,
    _memo: memo,
    _idempotency_key: idempotencyKey,
    _expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }
}

function parsePointAmount(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}
