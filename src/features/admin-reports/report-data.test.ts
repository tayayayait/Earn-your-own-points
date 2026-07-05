import { describe, expect, it } from "vitest";

import {
  buildCsvContent,
  buildReportExportRpcArgs,
  buildReportRpcArgs,
  getReportDateRange,
  getReportExportMode,
  normalizeReportResponse,
  type ReportFilters,
} from "./report-data";

const fixedNow = new Date("2026-07-04T05:00:00+09:00");

describe("admin report data helpers", () => {
  it("maps period filters to inclusive UI dates and exclusive RPC end dates", () => {
    const sevenDays = getReportDateRange({ period: "7d" }, fixedNow);
    expect(sevenDays).toEqual({
      dateFrom: "2026-06-28",
      dateTo: "2026-07-05",
      label: "2026.06.28 - 2026.07.04",
    });

    const custom = buildReportRpcArgs(
      { period: "custom", dateFrom: "2026-07-01", dateTo: "2026-07-03" },
      fixedNow,
    );
    expect(custom).toEqual({
      _date_from: "2026-07-01",
      _date_to: "2026-07-04",
      _limit: 10000,
    });
  });

  it("normalizes chart, ranking, event, and export rows", () => {
    const report = normalizeReportResponse({
      trend: [{ date: "2026-07-01", earned: "1200", used: "300" }],
      type_breakdown: [
        { type: "earn", label: "적립", amount: "1200", count: "3" },
        { type: "use", label: "사용", amount: "300", count: "1" },
      ],
      tier_balances: [
        { tier_id: "tier-vip", tier_name: "VIP", balance: "5000", customer_count: "2" },
      ],
      customer_rankings: [
        {
          user_id: "user-1",
          customer_name: "홍길동",
          customer_email: "hong@example.com",
          balance: "3000",
          earned: "5000",
          used: "2000",
        },
      ],
      event_performance: [
        {
          event_id: "event-1",
          event_name: "주말 적립",
          status: "active",
          spent_points: "2500",
          total_budget_points: "10000",
          reward_label: "추가 5%",
        },
      ],
      csv_rows: [
        {
          transaction_id: "tx-1",
          created_at: "2026-07-01T00:00:00+09:00",
          customer_name: "홍길동",
          customer_email: "hong@example.com",
          type: "earn",
          status: "confirmed",
          amount: "1200",
          balance_after: "3000",
          memo: "첫 구매",
        },
      ],
      export_row_count: "10001",
    });

    expect(report.trend[0]).toMatchObject({ earned: 1200, used: 300 });
    expect(report.typeBreakdown[0]).toMatchObject({ percent: 80 });
    expect(report.tierBalances[0]).toMatchObject({ tierName: "VIP", customerCount: 2 });
    expect(report.customerRanking[0]).toMatchObject({ balance: 3000, earned: 5000, used: 2000 });
    expect(report.eventPerformance[0]).toMatchObject({ budgetUsageRate: 25 });
    expect(report.csvRows[0]).toMatchObject({ transactionId: "tx-1", amount: 1200 });
    expect(report.exportRowCount).toBe(10001);
    expect(report.exportMode).toBe("async");
    expect(report.hasRows).toBe(true);
  });

  it("builds filtered export args and switches over 10,000 rows to async mode", () => {
    const filters: ReportFilters = {
      period: "custom",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    };

    expect(getReportExportMode(10000)).toBe("download");
    expect(getReportExportMode(10001)).toBe("async");
    expect(
      buildReportExportRpcArgs(filters, 10001, "관리자 리포트 CSV 다운로드", fixedNow),
    ).toEqual({
      _date_from: "2026-07-01",
      _date_to: "2026-08-01",
      _row_count: 10001,
      _reason: "관리자 리포트 CSV 다운로드",
    });
  });

  it("creates an escaped CSV with the filtered rows only", () => {
    const csv = buildCsvContent([
      {
        transactionId: "tx-1",
        createdAt: "2026-07-01T00:00:00+09:00",
        customerName: "홍,길동",
        customerEmail: "hong@example.com",
        type: "earn",
        status: "confirmed",
        amount: 1200,
        balanceAfter: 3000,
        memo: '메모 "확인"',
      },
    ]);

    expect(csv).toContain("거래 ID,일시,고객명,이메일,유형,상태,포인트,잔액,메모");
    expect(csv).toContain('"홍,길동"');
    expect(csv).toContain('"메모 ""확인"""');
    expect(csv).not.toContain("tx-2");
  });
});
