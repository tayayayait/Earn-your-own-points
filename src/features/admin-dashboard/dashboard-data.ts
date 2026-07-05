import { transactionTypeMap } from "@/lib/enums";
import { formatDate } from "@/lib/formatters";

export type DashboardPeriod = "7d" | "30d" | "90d" | "thisMonth";
export type PointDirection = "earn" | "use" | "default";

type RawDashboardMetrics = {
  kpis?: {
    total_customers?: unknown;
    total_earned_points?: unknown;
    total_redeemed_points?: unknown;
    remaining_points_total?: unknown;
    expiring_points_30d?: unknown;
  };
  changes?: {
    customers?: unknown;
    earned?: unknown;
    redeemed?: unknown;
    remaining?: unknown;
    expiring?: unknown;
  };
  trend?: RawTrendPoint[];
  type_breakdown?: RawTypeBreakdown[];
  recent_transactions?: RawRecentTransaction[];
  customer_rankings?: RawCustomerRanking[];
} | null;

export type RawTrendPoint = {
  date?: unknown;
  earned?: unknown;
  redeemed?: unknown;
  expired?: unknown;
  pending?: unknown;
};

export type RawTypeBreakdown = {
  type?: unknown;
  label?: unknown;
  amount?: unknown;
  count?: unknown;
};

export type RawRecentTransaction = {
  id?: unknown;
  user_id?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  type?: unknown;
  status?: unknown;
  amount?: unknown;
  balance_after?: unknown;
  memo?: unknown;
  created_at?: unknown;
};

export type RawCustomerRanking = {
  user_id?: unknown;
  customer_name?: unknown;
  customer_email?: unknown;
  balance?: unknown;
  earned?: unknown;
  redeemed?: unknown;
};

export type AdminDashboardMetrics = {
  kpis: {
    totalCustomers: number;
    totalEarnedPoints: number;
    totalRedeemedPoints: number;
    remainingPointsTotal: number;
    expiringPoints30d: number;
  };
  changes: {
    customers: number;
    earned: number;
    redeemed: number;
    remaining: number;
    expiring: number;
  };
  trend: Array<{
    date: string;
    dateLabel: string;
    earned: number;
    redeemed: number;
    expired: number;
    pending: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    label: string;
    amount: number;
    count: number;
  }>;
  recentTransactions: Array<{
    id: string;
    userId: string;
    customerName: string;
    customerEmail: string;
    type: string;
    status: string;
    amount: number;
    balanceAfter: number | null;
    memo: string | null;
    createdAt: string;
  }>;
  customerRankings: Array<{
    userId: string;
    customerName: string;
    customerEmail: string;
    balance: number;
    earned: number;
    redeemed: number;
  }>;
  hasTransactions: boolean;
};

const earnTypes = new Set(["earn", "event_earn", "manual_earn", "use_cancel"]);
const useTypes = new Set(["redeem", "use", "manual_deduct", "expire", "cancel", "earn_cancel"]);

export function getDashboardPeriodDays(period: DashboardPeriod): number {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  if (period === "thisMonth") return new Date().getDate();
  return 30;
}

export function getTransactionPointDirection(type: string): PointDirection {
  if (earnTypes.has(type)) return "earn";
  if (useTypes.has(type)) return "use";
  return "default";
}

export function getTransactionTypeLabel(type: string): string {
  const mapped = transactionTypeMap[type as keyof typeof transactionTypeMap];
  if (mapped) return mapped.label;

  const legacyLabels: Record<string, string> = {
    redeem: "포인트 사용",
    cancel: "취소",
  };

  return legacyLabels[type] ?? type;
}

export function normalizeDashboardMetrics(raw: RawDashboardMetrics): AdminDashboardMetrics {
  const trend = (raw?.trend ?? []).map((point) => {
    const date = toStringValue(point.date);

    return {
      date,
      dateLabel: date ? formatDate(date, "short") : "-",
      earned: toNumber(point.earned),
      redeemed: toNumber(point.redeemed),
      expired: toNumber(point.expired),
      pending: toNumber(point.pending),
    };
  });
  const recentTransactions = (raw?.recent_transactions ?? []).map((item) => ({
    id: toStringValue(item.id),
    userId: toStringValue(item.user_id),
    customerName: toStringValue(item.customer_name) || "-",
    customerEmail: toStringValue(item.customer_email),
    type: toStringValue(item.type),
    status: toStringValue(item.status),
    amount: toNumber(item.amount),
    balanceAfter: item.balance_after == null ? null : toNumber(item.balance_after),
    memo: item.memo == null ? null : toStringValue(item.memo),
    createdAt: toStringValue(item.created_at),
  }));

  return {
    kpis: {
      totalCustomers: toNumber(raw?.kpis?.total_customers),
      totalEarnedPoints: toNumber(raw?.kpis?.total_earned_points),
      totalRedeemedPoints: toNumber(raw?.kpis?.total_redeemed_points),
      remainingPointsTotal: toNumber(raw?.kpis?.remaining_points_total),
      expiringPoints30d: toNumber(raw?.kpis?.expiring_points_30d),
    },
    changes: {
      customers: toNumber(raw?.changes?.customers),
      earned: toNumber(raw?.changes?.earned),
      redeemed: toNumber(raw?.changes?.redeemed),
      remaining: toNumber(raw?.changes?.remaining),
      expiring: toNumber(raw?.changes?.expiring),
    },
    trend,
    typeBreakdown: (raw?.type_breakdown ?? []).map((item) => {
      const type = toStringValue(item.type);

      return {
        type,
        label: toStringValue(item.label) || getTransactionTypeLabel(type),
        amount: toNumber(item.amount),
        count: toNumber(item.count),
      };
    }),
    recentTransactions,
    customerRankings: (raw?.customer_rankings ?? []).map((item) => ({
      userId: toStringValue(item.user_id),
      customerName: toStringValue(item.customer_name) || "-",
      customerEmail: toStringValue(item.customer_email),
      balance: toNumber(item.balance),
      earned: toNumber(item.earned),
      redeemed: toNumber(item.redeemed),
    })),
    hasTransactions: Boolean(
      recentTransactions.length ||
      trend.some((point) => point.earned || point.redeemed || point.expired || point.pending),
    ),
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
