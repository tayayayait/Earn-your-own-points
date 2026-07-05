import { formatDate } from "@/lib/formatters";

export type ReportPeriod = "7d" | "30d" | "90d" | "thisMonth" | "custom";
export type ReportExportMode = "download" | "async";

export type ReportFilters = {
  period: ReportPeriod;
  dateFrom?: string;
  dateTo?: string;
};

export type ReportRpcArgs = {
  _date_from: string;
  _date_to: string;
  _limit: number;
};

export type ReportExportRpcArgs = {
  _date_from: string;
  _date_to: string;
  _row_count: number;
  _reason: string;
};

type RawReportResponse = {
  trend?: RawTrendPoint[];
  type_breakdown?: RawTypeBreakdown[];
  tier_balances?: RawTierBalance[];
  customer_rankings?: RawCustomerRanking[];
  event_performance?: RawEventPerformance[];
  csv_rows?: RawCsvRow[];
  export_row_count?: unknown;
} | null;

type RawTrendPoint = {
  date?: unknown;
  earned?: unknown;
  used?: unknown;
  redeemed?: unknown;
};

type RawTypeBreakdown = {
  type?: unknown;
  label?: unknown;
  amount?: unknown;
  count?: unknown;
  percent?: unknown;
};

type RawTierBalance = {
  tier_id?: unknown;
  tier_name?: unknown;
  balance?: unknown;
  customer_count?: unknown;
};

type RawCustomerRanking = {
  user_id?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  balance?: unknown;
  earned?: unknown;
  used?: unknown;
  redeemed?: unknown;
};

type RawEventPerformance = {
  event_id?: unknown;
  event_name?: unknown;
  status?: unknown;
  spent_points?: unknown;
  total_budget_points?: unknown;
  budget_usage_rate?: unknown;
  reward_label?: unknown;
};

type RawCsvRow = {
  transaction_id?: unknown;
  created_at?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  type?: unknown;
  status?: unknown;
  amount?: unknown;
  balance_after?: unknown;
  memo?: unknown;
};

export type AdminReportData = {
  trend: Array<{
    date: string;
    dateLabel: string;
    earned: number;
    used: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    label: string;
    amount: number;
    count: number;
    percent: number;
  }>;
  tierBalances: Array<{
    tierId: string | null;
    tierName: string;
    balance: number;
    customerCount: number;
  }>;
  customerRanking: Array<{
    userId: string;
    customerName: string;
    customerEmail: string;
    balance: number;
    earned: number;
    used: number;
  }>;
  eventPerformance: Array<{
    eventId: string;
    eventName: string;
    status: string;
    spentPoints: number;
    totalBudgetPoints: number | null;
    budgetUsageRate: number;
    rewardLabel: string;
  }>;
  csvRows: ReportCsvRow[];
  exportRowCount: number;
  exportMode: ReportExportMode;
  hasRows: boolean;
};

export type ReportCsvRow = {
  transactionId: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  type: string;
  status: string;
  amount: number;
  balanceAfter: number | null;
  memo: string;
};

const exportLimit = 10000;

const periodDays: Record<Exclude<ReportPeriod, "custom" | "thisMonth">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const transactionTypeLabels: Record<string, string> = {
  earn: "적립",
  event_earn: "이벤트 적립",
  manual_earn: "수동 적립",
  use_cancel: "사용 취소",
  redeem: "사용",
  use: "사용",
  manual_deduct: "수동 차감",
  expire: "만료",
  cancel: "취소",
  earn_cancel: "적립 취소",
  adjust: "조정",
};

export function getReportDateRange(filters: ReportFilters, now = new Date()) {
  const today = toSeoulDateInput(now);
  const tomorrow = addDays(today, 1);

  if (filters.period === "custom") {
    const dateFrom = normalizeDateInput(filters.dateFrom) ?? addDays(tomorrow, -30);
    const inclusiveDateTo = normalizeDateInput(filters.dateTo) ?? today;
    const safeDateTo = inclusiveDateTo < dateFrom ? dateFrom : inclusiveDateTo;
    const dateTo = addDays(safeDateTo, 1);

    return {
      dateFrom,
      dateTo,
      label: formatDateRangeLabel(dateFrom, safeDateTo),
    };
  }

  if (filters.period === "thisMonth") {
    const dateFrom = `${today.slice(0, 8)}01`;

    return {
      dateFrom,
      dateTo: tomorrow,
      label: formatDateRangeLabel(dateFrom, today),
    };
  }

  const dateFrom = addDays(tomorrow, -periodDays[filters.period]);

  return {
    dateFrom,
    dateTo: tomorrow,
    label: formatDateRangeLabel(dateFrom, today),
  };
}

export function getInclusiveDateTo(dateToExclusive: string): string {
  return addDays(dateToExclusive, -1);
}

export function buildReportRpcArgs(filters: ReportFilters, now = new Date()): ReportRpcArgs {
  const range = getReportDateRange(filters, now);

  return {
    _date_from: range.dateFrom,
    _date_to: range.dateTo,
    _limit: exportLimit,
  };
}

export function buildReportExportRpcArgs(
  filters: ReportFilters,
  rowCount: number,
  reason: string,
  now = new Date(),
): ReportExportRpcArgs {
  const range = getReportDateRange(filters, now);

  return {
    _date_from: range.dateFrom,
    _date_to: range.dateTo,
    _row_count: Math.max(0, Math.trunc(rowCount)),
    _reason: reason.trim(),
  };
}

export function getReportExportMode(rowCount: number): ReportExportMode {
  return rowCount > exportLimit ? "async" : "download";
}

export function normalizeReportResponse(raw: RawReportResponse): AdminReportData {
  const trend = normalizeArray(raw?.trend).map((point) => {
    const date = toStringValue(point.date);

    return {
      date,
      dateLabel: date ? formatDate(date, "short") : "-",
      earned: toNumber(point.earned),
      used: toNumber(point.used ?? point.redeemed),
    };
  });
  const typeBreakdownWithoutPercent = normalizeArray(raw?.type_breakdown).map((item) => {
    const type = toStringValue(item.type);

    return {
      type,
      label: toStringValue(item.label) || getReportTransactionTypeLabel(type),
      amount: toNumber(item.amount),
      count: toNumber(item.count),
      percent: toNumber(item.percent),
    };
  });
  const totalBreakdownAmount = typeBreakdownWithoutPercent.reduce(
    (sum, item) => sum + Math.abs(item.amount),
    0,
  );
  const typeBreakdown = typeBreakdownWithoutPercent.map((item) => ({
    ...item,
    percent:
      item.percent > 0
        ? item.percent
        : totalBreakdownAmount > 0
          ? Math.round((Math.abs(item.amount) / totalBreakdownAmount) * 100)
          : 0,
  }));
  const csvRows = normalizeArray(raw?.csv_rows).map(normalizeCsvRow);
  const exportRowCount = toNumber(raw?.export_row_count);

  return {
    trend,
    typeBreakdown,
    tierBalances: normalizeArray(raw?.tier_balances).map((item) => ({
      tierId: toNullableString(item.tier_id),
      tierName: toStringValue(item.tier_name) || "미지정",
      balance: toNumber(item.balance),
      customerCount: toNumber(item.customer_count),
    })),
    customerRanking: normalizeArray(raw?.customer_rankings).map((item) => ({
      userId: toStringValue(item.user_id),
      customerName: toStringValue(item.customer_name) || "-",
      customerEmail: toStringValue(item.customer_email),
      balance: toNumber(item.balance),
      earned: toNumber(item.earned),
      used: toNumber(item.used ?? item.redeemed),
    })),
    eventPerformance: normalizeArray(raw?.event_performance).map((item) => {
      const spentPoints = toNumber(item.spent_points);
      const totalBudgetPoints = toNullableNumber(item.total_budget_points);
      const budgetUsageRate =
        item.budget_usage_rate != null
          ? toNumber(item.budget_usage_rate)
          : totalBudgetPoints && totalBudgetPoints > 0
            ? Math.min(100, Math.round((spentPoints / totalBudgetPoints) * 100))
            : 0;

      return {
        eventId: toStringValue(item.event_id),
        eventName: toStringValue(item.event_name) || "-",
        status: toStringValue(item.status),
        spentPoints,
        totalBudgetPoints,
        budgetUsageRate,
        rewardLabel: toStringValue(item.reward_label) || "-",
      };
    }),
    csvRows,
    exportRowCount,
    exportMode: getReportExportMode(exportRowCount),
    hasRows: Boolean(
      exportRowCount ||
      csvRows.length ||
      trend.some((point) => point.earned || point.used) ||
      typeBreakdown.length,
    ),
  };
}

export function getReportTransactionTypeLabel(type: string): string {
  return transactionTypeLabels[type] ?? type;
}

export function buildCsvContent(rows: ReportCsvRow[]): string {
  const header = ["거래 ID", "일시", "고객명", "이메일", "유형", "상태", "포인트", "잔액", "메모"];
  const csvRows = rows.map((row) =>
    [
      row.transactionId,
      row.createdAt,
      row.customerName,
      row.customerEmail,
      getReportTransactionTypeLabel(row.type),
      row.status,
      row.amount,
      row.balanceAfter ?? "",
      row.memo,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return `\uFEFF${[header.join(","), ...csvRows].join("\r\n")}`;
}

function normalizeCsvRow(row: RawCsvRow): ReportCsvRow {
  return {
    transactionId: toStringValue(row.transaction_id),
    createdAt: toStringValue(row.created_at),
    customerName: toStringValue(row.customer_name) || "-",
    customerEmail: toStringValue(row.customer_email),
    type: toStringValue(row.type),
    status: toStringValue(row.status),
    amount: toNumber(row.amount),
    balanceAfter: toNullableNumber(row.balance_after),
    memo: toStringValue(row.memo),
  };
}

function escapeCsvCell(value: string | number): string {
  const normalized = String(value);

  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function normalizeArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return toNumber(value);
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null {
  const valueAsString = toStringValue(value);
  return valueAsString || null;
}

function normalizeDateInput(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function addDays(dateInput: string, days: number): string {
  const [year, month, day] = dateInput.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return formatUtcDateInput(date);
}

function formatUtcDateInput(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function toSeoulDateInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDateRangeLabel(dateFrom: string, inclusiveDateTo: string): string {
  return `${dateFrom.replaceAll("-", ".")} - ${inclusiveDateTo.replaceAll("-", ".")}`;
}
