import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PostgrestError } from "@supabase/supabase-js";
import { AlertCircle, BarChart3, Download, FileSpreadsheet, RefreshCw, Trophy } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
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
import { toast } from "sonner";

import { AppButton } from "@/components/common/AppButton";
import { AppInput } from "@/components/common/AppInput";
import { AppTable } from "@/components/common/AppTable";
import { PointDisplay } from "@/components/common/PointDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildCsvContent,
  buildReportExportRpcArgs,
  buildReportRpcArgs,
  getInclusiveDateTo,
  getReportDateRange,
  getReportTransactionTypeLabel,
  normalizeReportResponse,
  type AdminReportData,
  type ReportCsvRow,
  type ReportExportRpcArgs,
  type ReportFilters,
  type ReportPeriod,
  type ReportRpcArgs,
} from "@/features/admin-reports/report-data";
import { supabase } from "@/integrations/supabase/client";
import { formatApiErrorMessage } from "@/lib/api-error-handler";
import { formatDate, formatPoint } from "@/lib/formatters";

type RpcResponse<T> = Promise<{ data: T | null; error: PostgrestError | null }>;

type ReportRpcClient = Omit<typeof supabase, "rpc"> & {
  rpc(fn: "get_admin_reports", args: ReportRpcArgs): RpcResponse<unknown>;
  rpc(fn: "create_admin_report_export", args: ReportExportRpcArgs): RpcResponse<unknown>;
};

type CustomerRanking = AdminReportData["customerRanking"][number];
type EventPerformance = AdminReportData["eventPerformance"][number];
type ExportResult = { mode: "download" | "async"; jobId: string | null };

const reportClient = supabase as unknown as ReportRpcClient;
const EMPTY_REPORT = normalizeReportResponse(null);

const periodOptions: Array<{ label: string; value: ReportPeriod }> = [
  { label: "최근 7일", value: "7d" },
  { label: "최근 30일", value: "30d" },
  { label: "최근 90일", value: "90d" },
  { label: "이번 달", value: "thisMonth" },
  { label: "사용자 지정", value: "custom" },
];

const donutColors = [
  "var(--color-primary-600)",
  "var(--color-accent-500)",
  "var(--color-warning-500)",
  "var(--color-danger-600)",
  "var(--color-info-600)",
  "var(--color-slate-500)",
];

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "리포트 · 관리자" }] }),
  component: Page,
});

function Page() {
  const [filters, setFilters] = useState<ReportFilters>({ period: "30d" });
  const range = useMemo(() => getReportDateRange(filters), [filters]);

  const reportQuery = useQuery({
    queryKey: ["admin-reports", filters],
    queryFn: () => fetchReports(filters),
  });

  const report = reportQuery.data ?? EMPTY_REPORT;

  const exportMutation = useMutation({
    mutationFn: () => exportReport(filters, report),
    onSuccess: (result) => {
      if (result.mode === "async") {
        toast.info("10,000건 초과 리포트가 비동기 작업으로 등록되었습니다.");
        return;
      }

      toast.success("CSV 다운로드가 준비되었습니다.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function updatePeriod(period: ReportPeriod) {
    if (period === "custom") {
      setFilters((current) => ({
        period,
        dateFrom: current.dateFrom ?? range.dateFrom,
        dateTo: current.dateTo ?? getInclusiveDateTo(range.dateTo),
      }));
      return;
    }

    setFilters({ period });
  }

  const customerColumns = useMemo(
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
        header: "보유 포인트",
        align: "right" as const,
        render: (row: CustomerRanking) => (
          <PointDisplay value={row.balance} type="default" align="right" />
        ),
      },
      {
        key: "earned",
        header: "적립 포인트",
        align: "right" as const,
        render: (row: CustomerRanking) => (
          <PointDisplay value={row.earned} type="earn" align="right" />
        ),
      },
      {
        key: "used",
        header: "사용 포인트",
        align: "right" as const,
        render: (row: CustomerRanking) => (
          <PointDisplay value={row.used} type="use" align="right" />
        ),
      },
    ],
    [],
  );

  const eventColumns = useMemo(
    () => [
      {
        key: "event",
        header: "이벤트",
        render: (row: EventPerformance) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-slate-900)]">
              {row.eventName}
            </div>
            <div className="truncate text-xs text-[var(--color-slate-500)]">{row.rewardLabel}</div>
          </div>
        ),
      },
      {
        key: "status",
        header: "상태",
        render: (row: EventPerformance) => <StatusBadge status={row.status} type="policy" />,
      },
      {
        key: "budget",
        header: "예산 사용률",
        render: (row: EventPerformance) => (
          <div className="min-w-44 space-y-2">
            <Progress value={row.budgetUsageRate} aria-label={`${row.eventName} 예산 사용률`} />
            <div className="flex justify-between text-xs text-[var(--color-slate-500)]">
              <span>{row.budgetUsageRate}%</span>
              <span>
                {formatPoint(row.spentPoints)} /{" "}
                {row.totalBudgetPoints === null ? "제한 없음" : formatPoint(row.totalBudgetPoints)}
              </span>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-slate-900)]">통계 및 리포트</h1>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">
            기간별 포인트 흐름, 고객 등급, 이벤트 성과를 필터 기준으로 집계합니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AppButton
            type="button"
            variant="secondary"
            onClick={() => void reportQuery.refetch()}
            loading={reportQuery.isFetching && !reportQuery.isLoading}
            loadingLabel="새로고침"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            새로고침
          </AppButton>
          <AppButton
            type="button"
            onClick={() => exportMutation.mutate()}
            disabled={report.exportRowCount === 0}
            loading={exportMutation.isPending}
            loadingLabel="내보내기"
          >
            <Download className="size-4" aria-hidden="true" />
            CSV 다운로드
          </AppButton>
        </div>
      </header>

      <section className="rounded-lg border border-[var(--color-slate-200)] bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-end">
            <label className="space-y-1.5">
              <span className="block text-sm font-semibold text-[var(--color-slate-700)]">
                기간 필터
              </span>
              <select
                value={filters.period}
                onChange={(event) => updatePeriod(event.target.value as ReportPeriod)}
                className="h-10 w-full rounded-[6px] border border-[var(--color-slate-200)] bg-white px-3 text-sm text-[var(--color-slate-700)] outline-none focus:border-[var(--color-primary-600)] focus:ring-3 focus:ring-[var(--color-primary-50)]"
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {filters.period === "custom" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <AppInput
                  type="date"
                  label="시작일"
                  value={filters.dateFrom ?? ""}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, dateFrom: event.target.value }))
                  }
                />
                <AppInput
                  type="date"
                  label="종료일"
                  value={filters.dateTo ?? ""}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, dateTo: event.target.value }))
                  }
                />
              </div>
            )}
          </div>
          <div className="text-sm text-[var(--color-slate-500)]">
            <div className="font-semibold text-[var(--color-slate-900)]">{range.label}</div>
            <div>필터 적용 결과만 다운로드 · 10,000건 초과 시 비동기 작업 등록</div>
          </div>
        </div>
      </section>

      {reportQuery.error && (
        <section className="rounded-lg border border-[var(--color-danger-600)]/30 bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error-text)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold">리포트 데이터를 불러오지 못했습니다.</div>
              <div className="mt-1">{reportQuery.error.message}</div>
            </div>
          </div>
        </section>
      )}

      {reportQuery.isLoading ? (
        <ReportsSkeleton />
      ) : (
        <div className="space-y-6">
          {!report.hasRows && (
            <section className="rounded-lg border border-dashed border-[var(--color-slate-300)] bg-white p-6 text-sm text-[var(--color-slate-500)]">
              선택한 기간에 표시할 거래 데이터가 없습니다.
            </section>
          )}

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
            <ReportPanel
              icon={<BarChart3 className="size-4" aria-hidden="true" />}
              title="기간별 적립/사용"
              description="일자별 적립 포인트와 사용 포인트"
            >
              <AccessibleChartFrame
                aria-label="기간별 적립/사용 차트"
                descriptionId="trend-chart-description"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={report.trend}
                    margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke="var(--color-slate-200)" strokeDasharray="3 3" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} tickLine={false} />
                    <YAxis
                      width={72}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => Number(value).toLocaleString("ko-KR")}
                      tickLine={false}
                    />
                    <Tooltip formatter={(value) => formatPoint(Number(value))} />
                    <Line
                      type="monotone"
                      dataKey="earned"
                      name="적립"
                      stroke="var(--color-earn-icon)"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="used"
                      name="사용"
                      stroke="var(--color-use-icon)"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </AccessibleChartFrame>
              <p id="trend-chart-description" className="sr-only">
                데이터 테이블로 동일 정보를 제공하며 색상만으로 구분하지 않습니다.
              </p>
              <DataTableTitle />
              <AppTable
                data={report.trend}
                getRowKey={(row) => row.date}
                emptyMessage="기간별 데이터가 없습니다."
                columns={[
                  { key: "date", header: "일자", render: (row) => row.dateLabel },
                  {
                    key: "earned",
                    header: "적립",
                    align: "right",
                    render: (row) => <PointDisplay value={row.earned} type="earn" align="right" />,
                  },
                  {
                    key: "used",
                    header: "사용",
                    align: "right",
                    render: (row) => <PointDisplay value={row.used} type="use" align="right" />,
                  },
                ]}
              />
            </ReportPanel>

            <ReportPanel
              icon={<FileSpreadsheet className="size-4" aria-hidden="true" />}
              title="거래 유형 비율"
              description="거래 유형별 금액 비중 Donut Chart"
            >
              <AccessibleChartFrame
                aria-label="거래 유형 비율 차트"
                descriptionId="type-chart-description"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={report.typeBreakdown}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={72}
                      outerRadius={104}
                      paddingAngle={2}
                    >
                      {report.typeBreakdown.map((item, index) => (
                        <Cell
                          key={`${item.type}-${item.label}`}
                          fill={donutColors[index % donutColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatPoint(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </AccessibleChartFrame>
              <p id="type-chart-description" className="sr-only">
                데이터 테이블로 동일 정보를 제공하며 색상만으로 구분하지 않습니다.
              </p>
              <DataTableTitle />
              <AppTable
                data={report.typeBreakdown}
                getRowKey={(row) => row.type || row.label}
                emptyMessage="거래 유형 데이터가 없습니다."
                columns={[
                  {
                    key: "type",
                    header: "유형",
                    render: (row) => (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full bg-[var(--color-primary-600)]"
                          aria-hidden="true"
                        />
                        {row.label}
                      </span>
                    ),
                  },
                  {
                    key: "amount",
                    header: "금액",
                    align: "right",
                    render: (row) => <PointDisplay value={row.amount} align="right" />,
                  },
                  {
                    key: "percent",
                    header: "비율",
                    align: "right",
                    render: (row) => `${row.percent}%`,
                  },
                ]}
              />
            </ReportPanel>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <ReportPanel title="등급별 잔액" description="고객 등급별 보유 포인트 Bar Chart">
              <AccessibleChartFrame
                aria-label="등급별 잔액 차트"
                descriptionId="tier-chart-description"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={report.tierBalances}
                    margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke="var(--color-slate-200)" strokeDasharray="3 3" />
                    <XAxis dataKey="tierName" tick={{ fontSize: 12 }} tickLine={false} />
                    <YAxis
                      width={72}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => Number(value).toLocaleString("ko-KR")}
                      tickLine={false}
                    />
                    <Tooltip formatter={(value) => formatPoint(Number(value))} />
                    <Bar
                      dataKey="balance"
                      name="잔액"
                      fill="var(--color-info-600)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </AccessibleChartFrame>
              <p id="tier-chart-description" className="sr-only">
                데이터 테이블로 동일 정보를 제공하며 색상만으로 구분하지 않습니다.
              </p>
              <DataTableTitle />
              <AppTable
                data={report.tierBalances}
                getRowKey={(row) => row.tierId ?? row.tierName}
                emptyMessage="등급별 잔액 데이터가 없습니다."
                columns={[
                  { key: "tier", header: "등급", render: (row) => row.tierName },
                  {
                    key: "customers",
                    header: "고객 수",
                    align: "right",
                    render: (row) => row.customerCount.toLocaleString("ko-KR"),
                  },
                  {
                    key: "balance",
                    header: "잔액",
                    align: "right",
                    render: (row) => <PointDisplay value={row.balance} align="right" />,
                  },
                ]}
              />
            </ReportPanel>

            <ReportPanel
              icon={<Trophy className="size-4" aria-hidden="true" />}
              title="고객 랭킹"
              description="보유/사용/적립 포인트 기준 상위 고객"
            >
              <AppTable
                data={report.customerRanking}
                getRowKey={(row) => row.userId}
                emptyMessage="고객 랭킹 데이터가 없습니다."
                columns={customerColumns}
              />
            </ReportPanel>
          </section>

          <ReportPanel title="이벤트 성과" description="이벤트별 예산 소진율과 지급 성과">
            <AppTable
              data={report.eventPerformance}
              getRowKey={(row) => row.eventId}
              emptyMessage="이벤트 성과 데이터가 없습니다."
              columns={eventColumns}
            />
          </ReportPanel>
        </div>
      )}
    </div>
  );
}

async function fetchReports(filters: ReportFilters): Promise<AdminReportData> {
  const { data, error } = await reportClient.rpc("get_admin_reports", buildReportRpcArgs(filters));

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  return normalizeReportResponse(data);
}

async function exportReport(
  filters: ReportFilters,
  report: AdminReportData,
): Promise<ExportResult> {
  const { data, error } = await reportClient.rpc(
    "create_admin_report_export",
    buildReportExportRpcArgs(filters, report.exportRowCount, "관리자 리포트 CSV 다운로드"),
  );

  if (error) {
    throw new Error(error.message || formatApiErrorMessage(error));
  }

  const mode = isRecord(data) && data.mode === "async" ? "async" : "download";
  const jobId = isRecord(data) && typeof data.job_id === "string" ? data.job_id : null;

  if (mode === "download") {
    triggerCsvDownload(report.csvRows, filters);
  }

  return { mode, jobId };
}

function triggerCsvDownload(rows: ReportCsvRow[], filters: ReportFilters) {
  const range = getReportDateRange(filters);
  const blob = new Blob([buildCsvContent(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `admin-reports-${range.dateFrom}-${range.dateTo}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AccessibleChartFrame({
  "aria-label": ariaLabel,
  descriptionId,
  children,
}: {
  "aria-label": string;
  descriptionId: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      className="h-[320px] rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-600)] focus-visible:ring-offset-2"
    >
      {children}
    </div>
  );
}

function DataTableTitle() {
  return (
    <div className="mt-4 mb-2 text-xs font-bold uppercase tracking-normal text-[var(--color-slate-500)]">
      데이터 테이블
    </div>
  );
}

function ReportPanel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-slate-200)] bg-white shadow-sm">
      <div className="flex min-h-16 items-center gap-3 border-b border-[var(--color-slate-200)] px-5 py-4">
        {icon && (
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--color-slate-100)] text-[var(--color-slate-700)]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-[var(--color-slate-900)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--color-slate-500)]">{description}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Skeleton className="h-[520px] rounded-lg bg-[var(--color-slate-200)]" />
        <Skeleton className="h-[520px] rounded-lg bg-[var(--color-slate-200)]" />
      </section>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton className="h-[460px] rounded-lg bg-[var(--color-slate-200)]" />
        <Skeleton className="h-[460px] rounded-lg bg-[var(--color-slate-200)]" />
      </section>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
