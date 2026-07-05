import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  AlertCircle,
  CalendarDays,
  Clock3,
  Coins,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppButton } from "@/components/common/AppButton";
import { AppTable } from "@/components/common/AppTable";
import { PointDisplay } from "@/components/common/PointDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";
import { formatDate, formatPoint } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  getDashboardPeriodDays,
  getTransactionPointDirection,
  getTransactionTypeLabel,
  normalizeDashboardMetrics,
  type AdminDashboardMetrics,
  type DashboardPeriod,
} from "@/features/admin-dashboard/dashboard-data";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({ meta: [{ title: "대시보드 · 관리자" }] }),
  component: Dashboard,
});

type DashboardRpcClient = typeof supabase & {
  rpc(
    fn: "get_admin_dashboard_metrics",
    args: { _days: number },
  ): Promise<{ data: unknown; error: PostgrestError | null }>;
};

type RecentTransaction = AdminDashboardMetrics["recentTransactions"][number];
type CustomerRanking = AdminDashboardMetrics["customerRankings"][number];

const dashboardClient = supabase as unknown as DashboardRpcClient;

const periodOptions: Array<{ label: string; value: DashboardPeriod }> = [
  { label: "7일", value: "7d" },
  { label: "30일", value: "30d" },
  { label: "90일", value: "90d" },
  { label: "이번 달", value: "thisMonth" },
];

const lineSeries = [
  { key: "earned", name: "적립", color: "var(--color-earn-icon)" },
  { key: "redeemed", name: "사용", color: "var(--color-use-icon)" },
  { key: "expired", name: "만료", color: "var(--color-cancel-icon)" },
  { key: "pending", name: "대기", color: "var(--color-pending-icon)" },
] as const;

const pieColors = [
  "var(--color-primary-600)",
  "var(--color-accent-500)",
  "var(--color-warning-500)",
  "var(--color-danger-600)",
  "var(--color-info-600)",
  "var(--color-slate-500)",
];

function Dashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>("30d");

  const {
    data: metrics,
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin-dashboard-metrics", period],
    queryFn: () => fetchDashboardMetrics(period),
  });

  const recentColumns = useMemo(
    () => [
      {
        key: "createdAt",
        header: "일시",
        render: (row: RecentTransaction) => (
          <span className="text-[var(--color-slate-500)]">
            {row.createdAt ? formatDate(row.createdAt, "admin") : "-"}
          </span>
        ),
      },
      {
        key: "customer",
        header: "고객",
        render: (row: RecentTransaction) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">
              {row.customerName}
            </div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">
              {row.customerEmail || "-"}
            </div>
          </div>
        ),
      },
      {
        key: "type",
        header: "유형",
        render: (row: RecentTransaction) => (
          <span className="text-[var(--color-slate-700)]">{getTransactionTypeLabel(row.type)}</span>
        ),
      },
      {
        key: "status",
        header: "상태",
        render: (row: RecentTransaction) => (
          <StatusBadge status={normalizeTransactionStatus(row.status)} type="transaction" />
        ),
      },
      {
        key: "amount",
        header: "포인트",
        align: "right" as const,
        render: (row: RecentTransaction) => (
          <PointDisplay
            value={row.amount}
            type={getTransactionPointDirection(row.type)}
            align="right"
          />
        ),
      },
    ],
    [],
  );

  const rankingColumns = useMemo(
    () => [
      {
        key: "customer",
        header: "고객",
        render: (row: CustomerRanking) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">
              {row.customerName}
            </div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">
              {row.customerEmail || "-"}
            </div>
          </div>
        ),
      },
      {
        key: "balance",
        header: "잔여",
        align: "right" as const,
        render: (row: CustomerRanking) => (
          <PointDisplay value={row.balance} type="default" align="right" />
        ),
      },
      {
        key: "earned",
        header: "누적 적립",
        align: "right" as const,
        render: (row: CustomerRanking) => (
          <PointDisplay value={row.earned} type="earn" align="right" />
        ),
      },
      {
        key: "redeemed",
        header: "누적 사용",
        align: "right" as const,
        render: (row: CustomerRanking) => (
          <PointDisplay value={row.redeemed} type="use" align="right" />
        ),
      },
    ],
    [],
  );

  const typeBreakdown = metrics?.typeBreakdown.filter((item) => item.amount > 0) ?? [];
  const selectedPeriodLabel =
    periodOptions.find((option) => option.value === period)?.label ?? "30일";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">대시보드</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            포인트 운영 현황을 실시간 집계 데이터로 확인합니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="inline-flex rounded-lg border border-[var(--color-slate-200)] bg-white p-1"
            aria-label="집계 기간"
          >
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={cn(
                  "h-9 min-w-16 rounded-md px-3 text-sm font-semibold transition-colors",
                  period === option.value
                    ? "bg-[var(--color-primary-600)] text-white shadow-sm"
                    : "text-[var(--color-slate-600)] hover:bg-[var(--color-slate-100)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="md"
            onClick={() => void refetch()}
            loading={isFetching && !isLoading}
            loadingLabel="새로고침"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            새로고침
          </AppButton>
        </div>
      </header>

      {error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold">대시보드 데이터를 불러오지 못했습니다.</div>
              <div className="mt-1">{error.message}</div>
            </div>
          </div>
        </section>
      )}

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        metrics && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                icon={Users}
                label="전체 고객"
                value={metrics.kpis.totalCustomers.toLocaleString("ko-KR")}
                change={metrics.changes.customers}
              />
              <KpiCard
                icon={TrendingUp}
                label="누적 적립"
                value={formatPoint(metrics.kpis.totalEarnedPoints)}
                change={metrics.changes.earned}
                tone="earn"
              />
              <KpiCard
                icon={TrendingDown}
                label="누적 사용"
                value={formatPoint(metrics.kpis.totalRedeemedPoints)}
                change={metrics.changes.redeemed}
                tone="use"
              />
              <KpiCard
                icon={WalletCards}
                label="잔여 포인트"
                value={formatPoint(metrics.kpis.remainingPointsTotal)}
                change={metrics.changes.remaining}
                tone="info"
              />
              <KpiCard
                icon={Clock3}
                label="30일 내 만료 예정"
                value={formatPoint(metrics.kpis.expiringPoints30d)}
                change={metrics.changes.expiring}
                tone="warning"
              />
            </section>

            {!metrics.hasTransactions && (
              <EmptyPeriodState
                periodLabel={selectedPeriodLabel}
                onReset={() => setPeriod("30d")}
              />
            )}

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
              <DashboardPanel
                icon={CalendarDays}
                title="일자별 포인트 흐름"
                description={`${selectedPeriodLabel} 기준 적립, 사용, 만료, 대기 금액`}
              >
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={metrics.trend}
                      margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid stroke="var(--color-slate-200)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="dateLabel"
                        tick={{ fill: "var(--color-slate-500)", fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--color-slate-200)" }}
                      />
                      <YAxis
                        width={68}
                        tick={{ fill: "var(--color-slate-500)", fontSize: 12 }}
                        tickFormatter={(value) => Number(value).toLocaleString("ko-KR")}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          formatPoint(Number(value)),
                          lineSeries.find((series) => series.key === name)?.name ?? name,
                        ]}
                        labelClassName="font-semibold text-[var(--color-slate-900)]"
                        contentStyle={{
                          borderColor: "var(--color-slate-200)",
                          borderRadius: 8,
                          boxShadow: "0 8px 24px rgb(15 23 42 / 0.12)",
                        }}
                      />
                      {lineSeries.map((series) => (
                        <Line
                          key={series.key}
                          type="monotone"
                          dataKey={series.key}
                          name={series.name}
                          stroke={series.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </DashboardPanel>

              <DashboardPanel
                icon={Coins}
                title="거래 유형 구성"
                description={`${selectedPeriodLabel} 기준 유형별 합계`}
              >
                {typeBreakdown.length === 0 ? (
                  <ChartEmptyState />
                ) : (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={typeBreakdown}
                          dataKey="amount"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={72}
                          outerRadius={104}
                          paddingAngle={2}
                        >
                          {typeBreakdown.map((item, index) => (
                            <Cell
                              key={item.type || item.label}
                              fill={pieColors[index % pieColors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name) => [formatPoint(Number(value)), name]}
                          contentStyle={{
                            borderColor: "var(--color-slate-200)",
                            borderRadius: 8,
                            boxShadow: "0 8px 24px rgb(15 23 42 / 0.12)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-3 grid gap-2">
                  {typeBreakdown.map((item, index) => (
                    <div
                      key={`${item.type}-${item.label}`}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: pieColors[index % pieColors.length] }}
                          aria-hidden="true"
                        />
                        <span className="truncate font-medium text-[var(--color-slate-700)]">
                          {item.label}
                        </span>
                      </div>
                      <span className="shrink-0 tabular-nums text-[var(--color-slate-500)]">
                        {formatPoint(item.amount)} · {item.count.toLocaleString("ko-KR")}건
                      </span>
                    </div>
                  ))}
                </div>
              </DashboardPanel>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <DashboardPanel
                title="최근 거래"
                description="최신 거래 10건"
                action={
                  <span className="text-xs font-semibold text-[var(--color-slate-500)]">
                    {metrics.recentTransactions.length.toLocaleString("ko-KR")}건
                  </span>
                }
              >
                <AppTable
                  columns={recentColumns}
                  data={metrics.recentTransactions}
                  getRowKey={(row) => row.id}
                  emptyMessage="표시할 거래가 없습니다."
                />
              </DashboardPanel>

              <DashboardPanel
                title="고객 포인트 순위"
                description="잔여 포인트 상위 10명"
                action={
                  <span className="text-xs font-semibold text-[var(--color-slate-500)]">
                    {metrics.customerRankings.length.toLocaleString("ko-KR")}명
                  </span>
                }
              >
                <AppTable
                  columns={rankingColumns}
                  data={metrics.customerRankings}
                  getRowKey={(row) => row.userId}
                  emptyMessage="표시할 고객 순위가 없습니다."
                />
              </DashboardPanel>
            </section>
          </>
        )
      )}
    </div>
  );
}

async function fetchDashboardMetrics(period: DashboardPeriod): Promise<AdminDashboardMetrics> {
  const { data, error } = await dashboardClient.rpc("get_admin_dashboard_metrics", {
    _days: getDashboardPeriodDays(period),
  });

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeDashboardMetrics(data);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  change,
  tone = "default",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  change: number;
  tone?: "default" | "earn" | "use" | "warning" | "info";
}) {
  const toneClassName = {
    default: "bg-[var(--color-primary-50)] text-[var(--color-primary-600)]",
    earn: "bg-[var(--color-earn-bg)] text-[var(--color-earn-text)]",
    use: "bg-[var(--color-use-bg)] text-[var(--color-use-text)]",
    warning: "bg-[var(--color-pending-bg)] text-[var(--color-pending-text)]",
    info: "bg-cyan-50 text-[var(--color-info-600)]",
  }[tone];

  return (
    <article className="rounded-lg border border-[var(--color-slate-200)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[var(--color-slate-500)]">{label}</div>
        <div className={cn("grid size-9 place-items-center rounded-md", toneClassName)}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4 text-2xl font-bold tabular-nums text-[var(--color-slate-900)]">
        {value}
      </div>
      <ChangeBadge value={change} />
    </article>
  );
}

function ChangeBadge({ value }: { value: number }) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  return (
    <div className="mt-3 flex items-center gap-2 text-xs">
      <span
        className={cn(
          "inline-flex h-6 items-center rounded-full px-2 font-semibold tabular-nums",
          isPositive && "bg-[var(--color-earn-bg)] text-[var(--color-earn-text)]",
          isNegative && "bg-[var(--color-use-bg)] text-[var(--color-use-text)]",
          !isPositive && !isNegative && "bg-[var(--color-slate-100)] text-[var(--color-slate-500)]",
        )}
      >
        {isPositive ? "+" : ""}
        {value.toLocaleString("ko-KR")}%
      </span>
      <span className="text-[var(--color-slate-500)]">전 기간 대비</span>
    </div>
  );
}

function DashboardPanel({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white shadow-sm">
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[var(--color-slate-200)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-slate-100)] text-[var(--color-slate-700)]">
              <Icon className="size-4" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
            <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function EmptyPeriodState({ periodLabel, onReset }: { periodLabel: string; onReset: () => void }) {
  return (
    <section className="rounded-lg border border-dashed border-[var(--color-slate-300)] bg-white p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--color-slate-900)]">
            {periodLabel} 기간에 거래가 없습니다.
          </h2>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            기간을 30일로 되돌리면 최근 운영 데이터를 다시 확인할 수 있습니다.
          </p>
        </div>
        <AppButton type="button" variant="secondary" onClick={onReset}>
          <RefreshCw className="size-4" aria-hidden="true" />
          30일 보기
        </AppButton>
      </div>
    </section>
  );
}

function ChartEmptyState() {
  return (
    <div className="grid h-[320px] place-items-center rounded-lg border border-dashed border-[var(--color-slate-200)] bg-[var(--color-slate-50)] text-sm text-[var(--color-slate-500)]">
      집계할 거래 유형이 없습니다.
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-lg bg-[var(--color-slate-200)]" />
        ))}
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <Skeleton className="h-[430px] rounded-lg bg-[var(--color-slate-200)]" />
        <Skeleton className="h-[430px] rounded-lg bg-[var(--color-slate-200)]" />
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-lg bg-[var(--color-slate-200)]" />
        <Skeleton className="h-80 rounded-lg bg-[var(--color-slate-200)]" />
      </section>
    </div>
  );
}

function normalizeTransactionStatus(status: string): string {
  if (status === "completed") return "confirmed";
  if (status === "cancelled") return "canceled";
  return status;
}
