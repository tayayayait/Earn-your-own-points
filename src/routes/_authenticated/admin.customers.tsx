import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useMemo } from "react";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppTable } from "@/components/common/AppTable";
import { PointDisplay } from "@/components/common/PointDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";
import { customerStatusMap } from "@/lib/enums";
import { formatPhone } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  buildCustomerListRpcArgs,
  normalizeCustomerListResponse,
  toggleArrayValue,
  type CustomerListData,
  type CustomerListRow,
  type CustomerListSearchState,
  type CustomerSortBy,
  type SortDirection,
} from "@/features/admin-customers/customer-list-data";

type CustomerRouteSearch = {
  q: string;
  statuses: string[];
  tierIds: string[];
  minPoints: string;
  maxPoints: string;
  joinedFrom: string;
  joinedTo: string;
  sortBy: CustomerSortBy;
  sortDir: SortDirection;
  page: number;
};

type TierOption = {
  id: string;
  name: string;
  status: string | null;
  sort_order: number | null;
};

type AdminCustomerRpcClient = typeof supabase & {
  rpc(
    fn: "get_admin_customers",
    args: ReturnType<typeof buildCustomerListRpcArgs>,
  ): Promise<{ data: unknown; error: PostgrestError | null }>;
  from(table: "customer_tiers"): {
    select(columns: string): {
      order(
        column: string,
        options: { ascending: boolean },
      ): Promise<{ data: TierOption[] | null; error: PostgrestError | null }>;
    };
  };
};

const adminCustomerClient = supabase as unknown as AdminCustomerRpcClient;

const defaultSearch: CustomerRouteSearch = {
  q: "",
  statuses: [],
  tierIds: [],
  minPoints: "",
  maxPoints: "",
  joinedFrom: "",
  joinedTo: "",
  sortBy: "created_at",
  sortDir: "desc",
  page: 1,
};

const statusOptions = Object.entries(customerStatusMap).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

const sortOptions: Array<{ value: `${CustomerSortBy}:${SortDirection}`; label: string }> = [
  { value: "created_at:desc", label: "가입일 최신순" },
  { value: "created_at:asc", label: "가입일 오래된순" },
  { value: "balance:desc", label: "보유 포인트 높은순" },
  { value: "balance:asc", label: "보유 포인트 낮은순" },
  { value: "name:asc", label: "이름 오름차순" },
  { value: "name:desc", label: "이름 내림차순" },
];

export const Route = createFileRoute("/_authenticated/admin/customers")({
  validateSearch: (search: Record<string, unknown>): CustomerRouteSearch => ({
    q: toStringSearch(search.q),
    statuses: toArraySearch(search.statuses),
    tierIds: toArraySearch(search.tierIds),
    minPoints: toStringSearch(search.minPoints),
    maxPoints: toStringSearch(search.maxPoints),
    joinedFrom: toStringSearch(search.joinedFrom),
    joinedTo: toStringSearch(search.joinedTo),
    sortBy: toSortBy(search.sortBy),
    sortDir: search.sortDir === "asc" ? "asc" : "desc",
    page: toPositivePage(search.page),
  }),
  head: () => ({ meta: [{ title: "고객 관리 · 관리자" }] }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const customerQuery = useQuery({
    queryKey: ["admin-customers", search],
    queryFn: () => fetchCustomers(search),
  });

  const tiersQuery = useQuery({
    queryKey: ["admin-customer-tiers"],
    queryFn: fetchCustomerTiers,
  });

  const columns = useMemo(
    () => [
      {
        key: "customerCode",
        header: "고객 ID",
        render: (row: CustomerListRow) => (
          <span className="font-semibold tabular-nums text-[var(--color-slate-700)]">
            {row.customerCode}
          </span>
        ),
      },
      {
        key: "customer",
        header: "고객",
        render: (row: CustomerListRow) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">{row.name}</div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">
              {row.email || "-"} · {row.phone ? formatPhone(row.phone) : "-"}
            </div>
          </div>
        ),
      },
      {
        key: "tier",
        header: "등급",
        render: (row: CustomerListRow) => (
          <span className="inline-flex h-6 items-center rounded-full bg-[var(--color-primary-50)] px-2 text-xs font-semibold text-[var(--color-primary-700)]">
            {row.tierName}
          </span>
        ),
      },
      {
        key: "status",
        header: "상태",
        render: (row: CustomerListRow) => <StatusBadge status={row.status} type="customer" />,
      },
      {
        key: "balance",
        header: "보유 포인트",
        align: "right" as const,
        render: (row: CustomerListRow) => (
          <PointDisplay value={row.balance} align="right" type="default" />
        ),
      },
      {
        key: "pending",
        header: "적립 예정",
        align: "right" as const,
        render: (row: CustomerListRow) => (
          <PointDisplay value={row.pendingPoints} align="right" type="earn" />
        ),
      },
      {
        key: "lastTransactionAt",
        header: "최근 거래일",
        render: (row: CustomerListRow) => (
          <span className="text-[var(--color-slate-500)]">{row.lastTransactionLabel}</span>
        ),
      },
      {
        key: "createdAt",
        header: "가입일",
        render: (row: CustomerListRow) => (
          <span className="text-[var(--color-slate-500)]">{row.createdAtLabel}</span>
        ),
      },
      {
        key: "actions",
        header: "작업",
        align: "right" as const,
        render: (row: CustomerListRow) => (
          <div className="flex justify-end gap-2">
            <AppButton asChild variant="ghost" size="sm" className="min-w-0 px-2">
              <Link to="/admin/customers/$id" params={{ id: row.id }} aria-label="고객 상세">
                <Eye className="size-4" aria-hidden="true" />
              </Link>
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 px-2"
              disabled={row.status === "blocked" || row.status === "withdrawn"}
              aria-label="차단"
            >
              <Ban className="size-4" aria-hidden="true" />
            </AppButton>
          </div>
        ),
      },
    ],
    [],
  );

  const customers = customerQuery.data;
  const sortValue = `${search.sortBy}:${search.sortDir}` as const;
  const hasFilters = Boolean(
    search.q ||
    search.statuses.length ||
    search.tierIds.length ||
    search.minPoints ||
    search.maxPoints ||
    search.joinedFrom ||
    search.joinedTo ||
    search.sortBy !== defaultSearch.sortBy ||
    search.sortDir !== defaultSearch.sortDir,
  );

  function updateSearch(patch: Partial<CustomerRouteSearch>, keepPage = false) {
    const nextSearch = {
      ...search,
      ...patch,
      page: keepPage ? (patch.page ?? search.page) : 1,
    };

    void navigate({ search: nextSearch, replace: true });
  }

  function resetFilters() {
    void navigate({ search: defaultSearch, replace: true });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">고객 관리</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            고객 상태, 등급, 포인트 조건을 기준으로 운영 대상을 찾습니다.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-slate-200)] bg-white px-3 py-2 text-sm text-[var(--color-slate-600)]">
          <Users className="size-4 text-[var(--color-primary-600)]" aria-hidden="true" />총{" "}
          {customers?.totalCount.toLocaleString("ko-KR") ?? 0}명
        </div>
      </header>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--color-slate-900)]">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          필터
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,1.2fr)_minmax(180px,0.8fr)_minmax(220px,1fr)]">
          <label className="relative">
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              검색
            </span>
            <Search
              className="pointer-events-none absolute left-3 top-[38px] size-4 text-[var(--color-slate-500)]"
              aria-hidden="true"
            />
            <input
              value={search.q}
              onChange={(event) => updateSearch({ q: event.target.value })}
              placeholder="이름, 이메일, 전화번호, 고객 ID"
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-semibold text-[var(--color-slate-700)]">정렬</span>
            <select
              value={sortValue}
              onChange={(event) => {
                const [sortBy, sortDir] = event.target.value.split(":") as [
                  CustomerSortBy,
                  SortDirection,
                ];
                updateSearch({ sortBy, sortDir });
              }}
              className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              상태
            </span>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => {
                const selected = search.statuses.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      updateSearch({
                        statuses: toggleArrayValue(search.statuses, option.value),
                      })
                    }
                    className={cn(
                      "h-10 rounded-md border px-3 text-sm font-semibold transition-colors",
                      selected
                        ? "border-[var(--color-primary-600)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                        : "border-[var(--color-slate-200)] bg-white text-[var(--color-slate-700)] hover:bg-[var(--color-slate-50)]",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              등급
            </span>
            <div className="flex min-h-10 flex-wrap gap-2">
              {tiersQuery.isLoading && (
                <Skeleton className="h-10 w-32 bg-[var(--color-slate-200)]" />
              )}
              {!tiersQuery.isLoading && (tiersQuery.data ?? []).length === 0 && (
                <span className="inline-flex h-10 items-center rounded-md border border-dashed border-[var(--color-slate-200)] px-3 text-sm text-[var(--color-slate-500)]">
                  등록된 등급 없음
                </span>
              )}
              {(tiersQuery.data ?? []).map((tier) => {
                const selected = search.tierIds.includes(tier.id);

                return (
                  <button
                    key={tier.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      updateSearch({
                        tierIds: toggleArrayValue(search.tierIds, tier.id),
                      })
                    }
                    className={cn(
                      "h-10 rounded-md border px-3 text-sm font-semibold transition-colors",
                      selected
                        ? "border-[var(--color-primary-600)] bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                        : "border-[var(--color-slate-200)] bg-white text-[var(--color-slate-700)] hover:bg-[var(--color-slate-50)]",
                    )}
                  >
                    {tier.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              포인트 범위
            </span>
            <div className="grid grid-cols-2 gap-2">
              <AppInput
                type="number"
                inputMode="numeric"
                min={0}
                value={search.minPoints}
                onChange={(event) => updateSearch({ minPoints: event.target.value })}
                placeholder="최소"
              />
              <AppInput
                type="number"
                inputMode="numeric"
                min={0}
                value={search.maxPoints}
                onChange={(event) => updateSearch({ maxPoints: event.target.value })}
                placeholder="최대"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-[var(--color-slate-700)]">
              가입일
            </span>
            <div className="grid grid-cols-2 gap-2">
              <AppInput
                type="date"
                value={search.joinedFrom}
                onChange={(event) => updateSearch({ joinedFrom: event.target.value })}
                aria-label="가입 시작일"
              />
              <AppInput
                type="date"
                value={search.joinedTo}
                onChange={(event) => updateSearch({ joinedTo: event.target.value })}
                aria-label="가입 종료일"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <AppButton type="button" variant="ghost" onClick={resetFilters} disabled={!hasFilters}>
            <RotateCcw className="size-4" aria-hidden="true" />
            초기화
          </AppButton>
        </div>
      </section>

      {customerQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="font-semibold">고객 목록을 불러오지 못했습니다.</div>
          <div className="mt-1">{customerQuery.error.message}</div>
        </section>
      )}

      {customerQuery.isLoading ? (
        <CustomerListSkeleton />
      ) : (
        <section className="space-y-4">
          <AppTable
            columns={columns}
            data={customers?.customers ?? []}
            getRowKey={(row) => row.id}
            emptyMessage="조건에 맞는 고객이 없습니다."
          />
          <PaginationBar data={customers} onPageChange={(page) => updateSearch({ page }, true)} />
        </section>
      )}
    </div>
  );
}

async function fetchCustomers(search: CustomerListSearchState): Promise<CustomerListData> {
  const { data, error } = await adminCustomerClient.rpc(
    "get_admin_customers",
    buildCustomerListRpcArgs(search),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeCustomerListResponse(data);
}

async function fetchCustomerTiers(): Promise<TierOption[]> {
  const { data, error } = await adminCustomerClient
    .from("customer_tiers")
    .select("id,name,status,sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return data ?? [];
}

function PaginationBar({
  data,
  onPageChange,
}: {
  data: CustomerListData | undefined;
  onPageChange: (page: number) => void;
}) {
  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;
  const totalCount = data?.totalCount ?? 0;
  const from = totalCount === 0 ? 0 : (page - 1) * (data?.pageSize ?? 20) + 1;
  const to = Math.min(page * (data?.pageSize ?? 20), totalCount);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-slate-200)] bg-white px-4 py-3 text-sm text-[var(--color-slate-600)] md:flex-row md:items-center md:justify-between">
      <div>
        총 {totalCount.toLocaleString("ko-KR")}명 중 {from.toLocaleString("ko-KR")}-
        {to.toLocaleString("ko-KR")}명 표시 · {page.toLocaleString("ko-KR")} /{" "}
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

function CustomerListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-72 rounded-lg bg-[var(--color-slate-200)]" />
      <Skeleton className="h-14 rounded-lg bg-[var(--color-slate-200)]" />
    </div>
  );
}

function toStringSearch(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toArraySearch(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value) return [value];
  return [];
}

function toPositivePage(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function toSortBy(value: unknown): CustomerSortBy {
  if (value === "name" || value === "balance" || value === "created_at") return value;
  return "created_at";
}
