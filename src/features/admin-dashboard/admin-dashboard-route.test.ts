import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.dashboard.tsx"),
  "utf8",
);

describe("admin dashboard route", () => {
  it("uses the dashboard metrics RPC instead of client-side 1000 row aggregation", () => {
    expect(dashboardRoute).toContain("get_admin_dashboard_metrics");
    expect(dashboardRoute).not.toContain("limit(1000)");
  });

  it("renders the Phase 1-1 dashboard sections from normalized metrics", () => {
    expect(dashboardRoute).toContain("누적 적립");
    expect(dashboardRoute).toContain("누적 사용");
    expect(dashboardRoute).toContain("잔여 포인트");
    expect(dashboardRoute).toContain("30일 내 만료 예정");
    expect(dashboardRoute).toContain("일자별 포인트 흐름");
    expect(dashboardRoute).toContain("거래 유형 구성");
    expect(dashboardRoute).toContain("최근 거래");
    expect(dashboardRoute).toContain("고객 포인트 순위");
  });
});
