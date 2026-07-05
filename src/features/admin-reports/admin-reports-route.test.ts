import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.reports.tsx"),
  "utf8",
);
const adminPermissions = readFileSync(
  join(process.cwd(), "src", "features", "admin-permissions", "permissions.ts"),
  "utf8",
);

describe("admin reports route", () => {
  it("uses guarded report RPCs and is linked from admin navigation", () => {
    expect(route).toContain("get_admin_reports");
    expect(route).toContain("create_admin_report_export");
    expect(adminPermissions).toContain("/admin/reports");
  });

  it("renders Phase 4-1 report charts, tables, CSV, and accessibility requirements", () => {
    expect(route).toContain("기간별 적립/사용");
    expect(route).toContain("거래 유형 비율");
    expect(route).toContain("등급별 잔액");
    expect(route).toContain("고객 랭킹");
    expect(route).toContain("이벤트 성과");
    expect(route).toContain("CSV 다운로드");
    expect(route).toContain("필터 적용 결과만 다운로드");
    expect(route).toContain("10,000건 초과");
    expect(route).toContain("비동기 작업");
    expect(route).toContain("데이터 테이블");
    expect(route).toContain("색상만으로 구분하지 않습니다");
    expect(route).toContain('aria-label="기간별 적립/사용 차트"');
    expect(route).toContain('aria-label="거래 유형 비율 차트"');
    expect(route).toContain('aria-label="등급별 잔액 차트"');
  });
});
