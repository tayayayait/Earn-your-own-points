import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const detailRoute = readFileSync(
  join(process.cwd(), "src", "routes", "_authenticated", "admin.customers.$id.tsx"),
  "utf8",
);

describe("admin customer detail route", () => {
  it("uses customer detail and mutation RPCs instead of direct fixed profile/transaction loading", () => {
    expect(detailRoute).toContain("get_admin_customer_detail");
    expect(detailRoute).toContain("update_admin_customer_profile");
    expect(detailRoute).toContain("update_admin_customer_status");
    expect(detailRoute).toContain("create_admin_customer_point_transaction");
    expect(detailRoute).toContain("add_admin_customer_note");
    expect(detailRoute).not.toContain("limit(100)");
  });

  it("renders Phase 1-3 summary, tabs, actions, and edit restrictions", () => {
    expect(detailRoute).toContain("사용 가능");
    expect(detailRoute).toContain("적립 예정");
    expect(detailRoute).toContain("30일 내 만료");
    expect(detailRoute).toContain("누적 사용");
    expect(detailRoute).toContain("기본정보");
    expect(detailRoute).toContain("포인트 이력");
    expect(detailRoute).toContain("관리자 메모");
    expect(detailRoute).toContain("탈퇴 고객은 개인정보를 수정할 수 없습니다.");
    expect(detailRoute).toContain("차단 또는 탈퇴 고객은 포인트 조정이 비활성화됩니다.");
  });
});
