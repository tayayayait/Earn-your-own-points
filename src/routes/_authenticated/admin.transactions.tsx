import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppModal } from "@/components/common/AppModal";
import { AppTable } from "@/components/common/AppTable";
import { PointDisplay } from "@/components/common/PointDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TRANSACTION_PAGE_SIZE,
  buildTransactionListRpcArgs,
  createCancellationIdempotencyKey,
  normalizeCustomerOptions,
  normalizeTransactionDetail,
  normalizeTransactionListResponse,
  type CustomerOption,
  type TransactionDetail,
  type TransactionListData,
  type TransactionListRow,
  type TransactionListRpcArgs,
  type TransactionListSearchState,
} from "@/features/admin-transactions/transaction-list-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";
import { transactionStatusMap, transactionTypeMap } from "@/lib/enums";
import { formatPhone } from "@/lib/formatters";

const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

type TransactionRouteSearch = {
  transactionId: string;
  customerId: string;
  externalTransactionId: string;
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  page: number;
};

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type AdminTransactionsRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_transactions", args: TransactionListRpcArgs): RpcResponse<unknown>;
  rpc(fn: "get_admin_transaction_detail", args: { _transaction_id: string }): RpcResponse<unknown>;
  rpc(
    fn: "cancel_admin_transaction",
    args: { _transaction_id: string; _reason: string; _idempotency_key: string },
  ): RpcResponse<unknown>;
  rpc(
    fn: "retry_admin_transaction",
    args: { _transaction_id: string; _reason: string },
  ): RpcResponse<unknown>;
  rpc(
    fn: "search_admin_transaction_customers",
    args: { _query: string | null; _limit: number },
  ): RpcResponse<unknown>;
};

const adminTransactionsClient = supabase as unknown as AdminTransactionsRpcClient;

const defaultSearch: TransactionRouteSearch = {
  transactionId: "",
  customerId: "",
  externalTransactionId: "",
  type: "all",
  status: "all",
  dateFrom: "",
  dateTo: "",
  page: 1,
};

const typeOptions = Object.entries(transactionTypeMap).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

const statusOptions = Object.entries(transactionStatusMap).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export const Route = createFileRoute("/_authenticated/admin/transactions")({
  validateSearch: (search: Record<string, unknown>): TransactionRouteSearch => ({
    transactionId: toStringSearch(search.transactionId),
    customerId: toStringSearch(search.customerId),
    externalTransactionId: toStringSearch(search.externalTransactionId),
    type: toStringSearch(search.type) || "all",
    status: toStringSearch(search.status) || "all",
    dateFrom: toStringSearch(search.dateFrom),
    dateTo: toStringSearch(search.dateTo),
    page: toPositivePage(search.page),
  }),
  head: () => ({ meta: [{ title: "거래 내역 · 관리자" }] }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [customerQuery, setCustomerQuery] = useState("");
  const debouncedCustomerQuery = useDebouncedValue(customerQuery, CUSTOMER_SEARCH_DEBOUNCE_MS);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [detailTransactionId, setDetailTransactionId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TransactionListRow | null>(null);
  const [retryTarget, setRetryTarget] = useState<TransactionListRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [retryReason, setRetryReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const transactionsQuery = useQuery({
    queryKey: ["admin-transactions", search],
    queryFn: () => fetchTransactions(search),
  });

  const customerOptionsQuery = useQuery({
    queryKey: ["admin-transaction-customers", debouncedCustomerQuery],
    queryFn: () => fetchCustomerOptions(debouncedCustomerQuery),
    enabled: debouncedCustomerQuery.trim().length >= 2,
  });

  const detailQuery = useQuery({
    queryKey: ["admin-transaction-detail", detailTransactionId],
    queryFn: () => fetchTransactionDetail(detailTransactionId ?? ""),
    enabled: Boolean(detailTransactionId),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelTransaction,
    onSuccess: () => {
      setCancelTarget(null);
      setCancelReason("");
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-transaction-detail"] });
    },
    onError: (error) => setActionError(error.message),
  });

  const retryMutation = useMutation({
    mutationFn: retryTransaction,
    onSuccess: () => {
      setRetryTarget(null);
      setRetryReason("");
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-transaction-detail"] });
    },
    onError: (error) => setActionError(error.message),
  });

  const columns = useMemo(
    () => [
      {
        key: "transactionCode",
        header: "거래 ID",
        render: (row: TransactionListRow) => (
          <button
            type="button"
            className="font-semibold tabular-nums text-[var(--color-primary-700)] hover:underline"
            onClick={() => setDetailTransactionId(row.id)}
          >
            {row.transactionCode}
          </button>
        ),
      },
      {
        key: "customer",
        header: "고객",
        render: (row: TransactionListRow) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">
              {row.customerName}
            </div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">
              {row.customerCode} · {row.customerEmail || "-"}
            </div>
          </div>
        ),
      },
      {
        key: "type",
        header: "유형",
        render: (row: TransactionListRow) => (
          <StatusBadge status={row.type} type="transactionType" />
        ),
      },
      {
        key: "status",
        header: "상태",
        render: (row: TransactionListRow) => <StatusBadge status={row.status} type="transaction" />,
      },
      {
        key: "amount",
        header: "포인트",
        align: "right" as const,
        render: (row: TransactionListRow) => (
          <PointDisplay value={row.amount} type={row.direction} align="right" />
        ),
      },
      {
        key: "balance",
        header: "잔액",
        align: "right" as const,
        render: (row: TransactionListRow) => (
          <PointDisplay value={row.balanceAfter} type="default" align="right" />
        ),
      },
      {
        key: "memo",
        header: "사유",
        render: (row: TransactionListRow) => (
          <span className="line-clamp-2 text-[var(--color-slate-500)]">{row.memo ?? "-"}</span>
        ),
      },
      {
        key: "externalTransactionId",
        header: "외부 거래 ID",
        render: (row: TransactionListRow) => (
          <span className="tabular-nums text-[var(--color-slate-500)]">
            {row.externalTransactionId ?? "-"}
          </span>
        ),
      },
      {
        key: "createdAt",
        header: "생성일",
        render: (row: TransactionListRow) => (
          <span className="text-[var(--color-slate-500)]">{row.createdAtLabel}</span>
        ),
      },
      {
        key: "actions",
        header: "작업",
        align: "right" as const,
        render: (row: TransactionListRow) => (
          <div className="flex justify-end gap-2">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 px-2"
              onClick={() => setDetailTransactionId(row.id)}
              aria-label="거래 상세"
            >
              <Eye className="size-4" aria-hidden="true" />
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 px-2"
              disabled={!row.canCancel}
              onClick={() => {
                setActionError(null);
                setCancelTarget(row);
              }}
              aria-label="거래 취소"
            >
              <Ban className="size-4" aria-hidden="true" />
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 px-2"
              disabled={!row.canRetry}
              onClick={() => {
                setActionError(null);
                setRetryTarget(row);
              }}
              aria-label="재처리"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </AppButton>
          </div>
        ),
      },
    ],
    [],
  );

  const transactions = transactionsQuery.data;
  const hasFilters = Boolean(
    search.transactionId ||
    search.customerId ||
    search.externalTransactionId ||
    search.type !== defaultSearch.type ||
    search.status !== defaultSearch.status ||
    search.dateFrom ||
    search.dateTo,
  );

  function updateSearch(patch: Partial<TransactionRouteSearch>, keepPage = false) {
    const nextSearch = {
      ...search,
      ...patch,
      page: keepPage ? (patch.page ?? search.page) : 1,
    };

    void navigate({ search: nextSearch, replace: true });
  }

  function resetFilters() {
    setSelectedCustomer(null);
    setCustomerQuery("");
    void navigate({ search: defaultSearch, replace: true });
  }

  function selectCustomer(option: CustomerOption) {
    setSelectedCustomer(option);
    setCustomerQuery(option.label);
    updateSearch({ customerId: option.id });
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setCustomerQuery("");
    updateSearch({ customerId: "" });
  }

  function submitCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 10) {
      setActionError("취소 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    cancelMutation.mutate({
      transactionId: cancelTarget.id,
      reason: cancelReason,
      idempotencyKey: createCancellationIdempotencyKey(cancelTarget.id),
    });
  }

  function submitRetry() {
    if (!retryTarget) return;
    if (retryReason.trim().length < 10) {
      setActionError("재처리 사유는 10자 이상 입력해야 합니다.");
      return;
    }

    retryMutation.mutate({ transactionId: retryTarget.id, reason: retryReason });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">거래 내역</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            거래 ID, 고객, 외부 거래 ID 기준으로 포인트 처리 이력을 추적합니다.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-slate-200)] bg-white px-3 py-2 text-sm text-[var(--color-slate-600)]">
          총 {transactions?.totalCount.toLocaleString("ko-KR") ?? 0}건
        </div>
      </header>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--color-slate-900)]">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          필터
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(260px,1.2fr)_minmax(220px,1fr)]">
          <label className="relative">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              거래 ID
            </span>
            <Search
              className="pointer-events-none absolute left-3 top-[38px] size-4 text-[var(--color-slate-500)]"
              aria-hidden="true"
            />
            <input
              value={search.transactionId}
              onChange={(event) => updateSearch({ transactionId: event.target.value })}
              placeholder="PTX-20260703-000001 또는 UUID"
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            />
          </label>

          <div className="relative">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              고객 검색
            </span>
            <input
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              placeholder="이름, 이메일, 고객 ID"
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            />
            {search.customerId && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[var(--color-primary-700)]"
                onClick={clearCustomer}
              >
                선택 해제: {selectedCustomer?.label ?? search.customerId}
              </button>
            )}
            {debouncedCustomerQuery.trim().length >= 2 && !search.customerId && (
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

          <label className="relative">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              외부 거래 ID
            </span>
            <input
              value={search.externalTransactionId}
              onChange={(event) => updateSearch({ externalTransactionId: event.target.value })}
              placeholder="외부 결제/주문 거래 ID"
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <label className="space-y-1.5">
            <span className="block text-sm font-semibold text-[var(--color-slate-700)]">유형</span>
            <select
              value={search.type}
              onChange={(event) => updateSearch({ type: event.target.value })}
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            >
              <option value="all">전체 유형</option>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-semibold text-[var(--color-slate-700)]">상태</span>
            <select
              value={search.status}
              onChange={(event) => updateSearch({ status: event.target.value })}
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            >
              <option value="all">전체 상태</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <AppInput
            type="date"
            label="시작일"
            value={search.dateFrom}
            onChange={(event) => updateSearch({ dateFrom: event.target.value })}
          />
          <AppInput
            type="date"
            label="종료일"
            value={search.dateTo}
            onChange={(event) => updateSearch({ dateTo: event.target.value })}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <AppButton type="button" variant="ghost" onClick={resetFilters} disabled={!hasFilters}>
            <RotateCcw className="size-4" aria-hidden="true" />
            초기화
          </AppButton>
        </div>
      </section>

      {transactionsQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="font-semibold">거래 목록을 불러오지 못했습니다.</div>
          <div className="mt-1">{transactionsQuery.error.message}</div>
        </section>
      )}

      {transactionsQuery.isLoading ? (
        <TransactionListSkeleton />
      ) : (
        <section className="space-y-4">
          <AppTable
            columns={columns}
            data={transactions?.transactions ?? []}
            getRowKey={(row) => row.id}
            emptyMessage="조건에 맞는 거래가 없습니다."
          />
          <PaginationBar
            data={transactions}
            onPageChange={(page) => updateSearch({ page }, true)}
          />
        </section>
      )}

      <TransactionDetailModal
        detail={detailQuery.data}
        loading={detailQuery.isLoading}
        open={Boolean(detailTransactionId)}
        onOpenChange={(open) => {
          if (!open) setDetailTransactionId(null);
        }}
        onCancel={(transaction) => {
          setActionError(null);
          setCancelTarget(transaction);
        }}
        onRetry={(transaction) => {
          setActionError(null);
          setRetryTarget(transaction);
        }}
      />

      <AppModal
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="거래 취소"
        description="취소 가능 거래만 원거래와 연결된 역거래로 처리됩니다."
        size="md"
        footer={
          <>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setCancelTarget(null)}
              disabled={cancelMutation.isPending}
            >
              닫기
            </AppButton>
            <AppButton
              type="button"
              variant="danger"
              onClick={submitCancel}
              loading={cancelMutation.isPending}
              loadingLabel="취소 중"
            >
              취소 거래 생성
            </AppButton>
          </>
        }
      >
        <div className="space-y-4">
          <InfoRow label="거래 ID" value={cancelTarget?.transactionCode ?? "-"} />
          <InfoRow label="취소 가능" value={cancelTarget?.canCancel ? "가능" : "불가"} />
          <AppInput
            label="취소 사유"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="10자 이상 입력"
            error={actionError ?? undefined}
          />
        </div>
      </AppModal>

      <AppModal
        open={Boolean(retryTarget)}
        onOpenChange={(open) => {
          if (!open) setRetryTarget(null);
        }}
        title="거래 재처리"
        description="FAILED 상태 거래만 재처리 요청을 기록합니다."
        size="md"
        footer={
          <>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setRetryTarget(null)}
              disabled={retryMutation.isPending}
            >
              닫기
            </AppButton>
            <AppButton
              type="button"
              onClick={submitRetry}
              loading={retryMutation.isPending}
              loadingLabel="재처리 중"
            >
              재처리
            </AppButton>
          </>
        }
      >
        <div className="space-y-4">
          <InfoRow label="거래 ID" value={retryTarget?.transactionCode ?? "-"} />
          <InfoRow label="상태" value={retryTarget?.status ?? "-"} />
          <AppInput
            label="재처리 사유"
            value={retryReason}
            onChange={(event) => setRetryReason(event.target.value)}
            placeholder="10자 이상 입력"
            error={actionError ?? undefined}
          />
        </div>
      </AppModal>
    </div>
  );
}

async function fetchTransactions(search: TransactionListSearchState): Promise<TransactionListData> {
  const { data, error } = await adminTransactionsClient.rpc(
    "get_admin_transactions",
    buildTransactionListRpcArgs(search),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeTransactionListResponse(data);
}

async function fetchTransactionDetail(transactionId: string): Promise<TransactionDetail | null> {
  const { data, error } = await adminTransactionsClient.rpc("get_admin_transaction_detail", {
    _transaction_id: transactionId,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeTransactionDetail(data);
}

async function fetchCustomerOptions(query: string): Promise<CustomerOption[]> {
  const { data, error } = await adminTransactionsClient.rpc("search_admin_transaction_customers", {
    _query: query.trim() || null,
    _limit: 8,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeCustomerOptions(data);
}

async function cancelTransaction({
  transactionId,
  reason,
  idempotencyKey,
}: {
  transactionId: string;
  reason: string;
  idempotencyKey: string;
}) {
  const { error } = await adminTransactionsClient.rpc("cancel_admin_transaction", {
    _transaction_id: transactionId,
    _reason: reason,
    _idempotency_key: idempotencyKey,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }
}

async function retryTransaction({
  transactionId,
  reason,
}: {
  transactionId: string;
  reason: string;
}) {
  const { error } = await adminTransactionsClient.rpc("retry_admin_transaction", {
    _transaction_id: transactionId,
    _reason: reason,
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }
}

function TransactionDetailModal({
  detail,
  loading,
  open,
  onOpenChange,
  onCancel,
  onRetry,
}: {
  detail: TransactionDetail | null | undefined;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (transaction: TransactionListRow) => void;
  onRetry: (transaction: TransactionListRow) => void;
}) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="거래 상세"
      description="기본 거래 정보, 고객 정보, 정책 적용 정보, 처리 로그를 확인합니다."
      size="xl"
      footer={
        detail ? (
          <>
            <AppButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              닫기
            </AppButton>
            <AppButton
              type="button"
              variant="danger"
              disabled={!detail.transaction.canCancel}
              onClick={() => onCancel(detail.transaction)}
            >
              거래 취소
            </AppButton>
            <AppButton
              type="button"
              disabled={!detail.transaction.canRetry}
              onClick={() => onRetry(detail.transaction)}
            >
              재처리
            </AppButton>
          </>
        ) : undefined
      }
    >
      {loading && <Skeleton className="h-72 rounded-lg bg-[var(--color-slate-200)]" />}
      {!loading && !detail && (
        <div className="rounded-lg border border-dashed border-[var(--color-slate-200)] p-6 text-center text-[var(--color-slate-500)]">
          거래 상세를 찾을 수 없습니다.
        </div>
      )}
      {!loading && detail && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DetailSection title="기본 거래 정보">
            <InfoRow label="거래 ID" value={detail.transaction.transactionCode} />
            <InfoRow label="유형" value={detail.transaction.typeLabel} />
            <InfoRow label="상태" value={detail.transaction.status} />
            <InfoRow
              label="포인트"
              value={`${detail.transaction.amount.toLocaleString("ko-KR")}P`}
            />
            <InfoRow
              label="잔액"
              value={
                detail.transaction.balanceAfter == null
                  ? "-"
                  : `${detail.transaction.balanceAfter.toLocaleString("ko-KR")}P`
              }
            />
            <InfoRow label="외부 거래 ID" value={detail.transaction.externalTransactionId ?? "-"} />
            <InfoRow label="원거래" value={detail.transaction.originalTransactionId ?? "-"} />
            <InfoRow label="생성일" value={detail.transaction.createdAtLabel} />
            <InfoRow label="취소 가능" value={detail.transaction.canCancel ? "가능" : "불가"} />
            <InfoRow label="재처리 가능" value={detail.transaction.canRetry ? "가능" : "불가"} />
          </DetailSection>

          <DetailSection title="고객 정보">
            <InfoRow label="고객" value={detail.customer.customerLabel} />
            <InfoRow label="상태" value={detail.customer.status} />
            <InfoRow label="등급" value={detail.customer.tierName} />
            <InfoRow
              label="연락처"
              value={detail.customer.phone ? formatPhone(detail.customer.phone) : "-"}
            />
            <InfoRow label="이메일" value={detail.customer.email || "-"} />
          </DetailSection>

          <DetailSection title="정책 적용 정보">
            <InfoRow label="정책명" value={detail.policy.policyName} />
            <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-[var(--color-slate-50)] p-3 text-xs text-[var(--color-slate-700)]">
              {JSON.stringify(detail.policy.policySnapshot, null, 2)}
            </pre>
          </DetailSection>

          <DetailSection title="처리 로그">
            {detail.logs.length === 0 ? (
              <div className="text-sm text-[var(--color-slate-500)]">처리 로그가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {detail.logs.map((log) => (
                  <div
                    key={log.id || `${log.action}-${log.createdAt}`}
                    className="rounded-md border border-[var(--color-slate-200)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-[var(--color-slate-900)]">
                        {log.action}
                      </div>
                      <div className="shrink-0 text-xs text-[var(--color-slate-500)]">
                        {log.createdAtLabel}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-slate-500)]">
                      {log.actorLabel}
                    </div>
                    {log.reason && <div className="mt-2 text-sm">{log.reason}</div>}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        </div>
      )}
    </AppModal>
  );
}

function PaginationBar({
  data,
  onPageChange,
}: {
  data: TransactionListData | undefined;
  onPageChange: (page: number) => void;
}) {
  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;
  const totalCount = data?.totalCount ?? 0;
  const pageSize = data?.pageSize ?? TRANSACTION_PAGE_SIZE;
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-slate-200)] bg-white px-4 py-3 text-sm text-[var(--color-slate-600)] md:flex-row md:items-center md:justify-between">
      <div>
        총 {totalCount.toLocaleString("ko-KR")}건 중 {from.toLocaleString("ko-KR")}-
        {to.toLocaleString("ko-KR")}건 표시 · {page.toLocaleString("ko-KR")} /{" "}
        {totalPages.toLocaleString("ko-KR")}페이지
      </div>
      <div className="flex items-center justify-end gap-2">
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          이전
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          다음
          <ChevronRight className="size-4" aria-hidden="true" />
        </AppButton>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] p-4">
      <h3 className="text-sm font-bold text-[var(--color-slate-900)]">{title}</h3>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
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

function TransactionListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-80 rounded-lg bg-[var(--color-slate-200)]" />
      <Skeleton className="h-14 rounded-lg bg-[var(--color-slate-200)]" />
    </div>
  );
}

function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function toStringSearch(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toPositivePage(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
