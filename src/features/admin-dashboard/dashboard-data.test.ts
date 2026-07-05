import { describe, expect, it } from "vitest";

import {
  getDashboardPeriodDays,
  getTransactionPointDirection,
  normalizeDashboardMetrics,
} from "./dashboard-data";

describe("getDashboardPeriodDays", () => {
  it("maps dashboard period choices to RPC day windows", () => {
    expect(getDashboardPeriodDays("7d")).toBe(7);
    expect(getDashboardPeriodDays("30d")).toBe(30);
    expect(getDashboardPeriodDays("90d")).toBe(90);
    expect(getDashboardPeriodDays("thisMonth")).toBeGreaterThanOrEqual(1);
  });
});

describe("getTransactionPointDirection", () => {
  it("handles legacy and detailed transaction types", () => {
    expect(getTransactionPointDirection("earn")).toBe("earn");
    expect(getTransactionPointDirection("manual_earn")).toBe("earn");
    expect(getTransactionPointDirection("redeem")).toBe("use");
    expect(getTransactionPointDirection("manual_deduct")).toBe("use");
    expect(getTransactionPointDirection("adjust")).toBe("default");
  });
});

describe("normalizeDashboardMetrics", () => {
  it("normalizes RPC payloads into render-safe defaults", () => {
    const metrics = normalizeDashboardMetrics({
      kpis: {
        total_customers: 3,
        total_earned_points: "1000",
        total_redeemed_points: 200,
        remaining_points_total: null,
        expiring_points_30d: 50,
      },
      changes: {
        customers: 25,
        earned: null,
        redeemed: -10,
        remaining: 0,
        expiring: 100,
      },
      trend: [{ date: "2026-07-03", earned: 100, redeemed: 20, expired: 0, pending: 5 }],
      type_breakdown: [{ type: "earn", label: "구매 적립", amount: 100, count: 1 }],
      recent_transactions: [
        {
          id: "tx1",
          user_id: "user1",
          customer_name: "홍길동",
          customer_email: "hong@example.com",
          type: "earn",
          status: "completed",
          amount: 100,
          balance_after: 100,
          memo: null,
          created_at: "2026-07-03T00:00:00+09:00",
        },
      ],
      customer_rankings: [
        {
          user_id: "user1",
          customer_name: "홍길동",
          customer_email: "hong@example.com",
          balance: 100,
          earned: 100,
          redeemed: 0,
        },
      ],
    });

    expect(metrics.kpis.remainingPointsTotal).toBe(0);
    expect(metrics.kpis.totalEarnedPoints).toBe(1000);
    expect(metrics.changes.earned).toBe(0);
    expect(metrics.trend[0].dateLabel).toBe("07.03");
    expect(metrics.typeBreakdown[0].label).toBe("구매 적립");
    expect(metrics.hasTransactions).toBe(true);
  });

  it("returns stable empty data for missing payloads", () => {
    const metrics = normalizeDashboardMetrics(null);

    expect(metrics.kpis.totalCustomers).toBe(0);
    expect(metrics.trend).toEqual([]);
    expect(metrics.recentTransactions).toEqual([]);
    expect(metrics.customerRankings).toEqual([]);
    expect(metrics.hasTransactions).toBe(false);
  });

  it("does not treat generated zero-value trend days as transactions", () => {
    const metrics = normalizeDashboardMetrics({
      trend: [{ date: "2026-07-03", earned: 0, redeemed: 0, expired: 0, pending: 0 }],
      recent_transactions: [],
    });

    expect(metrics.trend).toHaveLength(1);
    expect(metrics.hasTransactions).toBe(false);
  });
});
